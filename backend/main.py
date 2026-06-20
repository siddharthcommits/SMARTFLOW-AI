import os
from datetime import datetime, timedelta
import joblib
import pandas as pd
import numpy as np
from fastapi import FastAPI, Depends, HTTPException, status, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from .database import init_db, get_db, Incident, User
from .auth import (
    create_access_token,
    get_current_user,
    RoleChecker,
    verify_password,
    get_password_hash
)
from .ml.hotspots import detect_hotspots
from .ml.routing import get_diversion_route, JUNCTION_COORDS, get_secondary_route, estimate_affected_vehicles
from .pdf_generator import generate_incident_pdf, generate_commissioner_report_pdf

app = FastAPI(title="SMARTFLOW AI Backend", version="1.0.0")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model variables
preprocessor = None
xgb_clearance_model = None
cat_impact_model = None
rf_road_closure_model = None
shap_explainer = None
feature_names = None

MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ml", "models")

@app.on_event("startup")
def startup_event():
    global preprocessor, xgb_clearance_model, cat_impact_model, rf_road_closure_model, shap_explainer, feature_names
    
    # 1. Initialize and Seed database
    init_db()
    
    # 2. Try to load models
    try:
        prep_path = os.path.join(MODELS_DIR, "preprocessor.joblib")
        xgb_path = os.path.join(MODELS_DIR, "xgb_clearance_model.joblib")
        cat_path = os.path.join(MODELS_DIR, "cat_impact_model.joblib")
        rf_path = os.path.join(MODELS_DIR, "rf_road_closure_model.joblib")
        shap_path = os.path.join(MODELS_DIR, "shap_explainer.joblib")
        feats_path = os.path.join(MODELS_DIR, "feature_names.joblib")
        
        if all(os.path.exists(p) for p in [prep_path, xgb_path, cat_path, rf_path, shap_path, feats_path]):
            preprocessor = joblib.load(prep_path)
            xgb_clearance_model = joblib.load(xgb_path)
            cat_impact_model = joblib.load(cat_path)
            rf_road_closure_model = joblib.load(rf_path)
            shap_explainer = joblib.load(shap_path)
            feature_names = joblib.load(feats_path)
            print("ML Models loaded successfully from disk!")
        else:
            print("ML Models not found on disk. Falling back to rule-based predictors.")
    except Exception as e:
        print(f"Error loading models: {e}. Falling back to rule-based predictors.")

# ----------------- Auth Endpoints -----------------

@app.post("/api/auth/token")
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role
        }
    }

@app.get("/api/auth/me")
def read_users_me(current_user: User = Depends(get_current_user)):
    return {
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": current_user.role
    }

# ----------------- Incident Management Endpoints -----------------

@app.get("/api/incidents")
def get_incidents(
    status: str = Query(None, description="Filter by status: Active or Cleared"),
    priority: str = Query(None, description="Filter by priority: Low, Medium, High, Critical"),
    zone: str = Query(None, description="Filter by zone"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Incident)
    if status:
        query = query.filter(Incident.status == status)
    if priority:
        query = query.filter(Incident.priority == priority)
    if zone:
        query = query.filter(Incident.zone == zone)
        
    # Order by ID descending so newest are on top
    incidents = query.order_by(Incident.id.desc()).all()
    return incidents

@app.post("/api/incidents")
def create_incident(
    incident_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker(["admin", "supervisor"]))
):
    # Setup start_datetime
    start_dt = datetime.now()
    
    # Run predictions using ML models or Fallback
    pred_res = run_inference_helper(incident_data)
    
    # Set end_datetime based on predicted clearance time
    pred_clearance_mins = pred_res["predicted_clearance_time_mins"]
    end_dt = start_dt + timedelta(minutes=pred_clearance_mins)
    
    new_inc = Incident(
        event_type=incident_data.get("event_type"),
        event_cause=incident_data.get("event_cause"),
        latitude=float(incident_data.get("latitude")),
        longitude=float(incident_data.get("longitude")),
        corridor=incident_data.get("corridor"),
        zone=incident_data.get("zone"),
        police_station=incident_data.get("police_station"),
        junction=incident_data.get("junction"),
        priority=incident_data.get("priority"),
        requires_road_closure=bool(incident_data.get("requires_road_closure", False)),
        vehicle_type=incident_data.get("vehicle_type", "None"),
        start_datetime=start_dt,
        end_datetime=end_dt,
        status="Active"
    )
    
    db.add(new_inc)
    db.commit()
    db.refresh(new_inc)
    return {
        "message": "Incident reported successfully!",
        "incident": new_inc,
        "predictions": pred_res
    }

@app.put("/api/incidents/{incident_id}/status")
def update_incident_status(
    incident_id: int,
    status_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker(["admin", "supervisor"]))
):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
        
    new_status = status_data.get("status", "Cleared")
    inc.status = new_status
    if new_status == "Cleared":
        inc.end_datetime = datetime.now()
        
    db.commit()
    return {"message": f"Incident status updated to {new_status}", "incident": inc}

# ----------------- Dashboard & Analytics Endpoints -----------------

@app.get("/api/dashboard/stats")
def get_dashboard_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total_incidents = db.query(Incident).count()
    active_incidents = db.query(Incident).filter(Incident.status == "Active").count()
    
    # Calculate average clearance time in minutes for cleared incidents
    cleared = db.query(Incident).filter(Incident.status == "Cleared").all()
    if cleared:
        durations = []
        for c in cleared:
            if c.end_datetime and c.start_datetime:
                durations.append((c.end_datetime - c.start_datetime).total_seconds() / 60.0)
        avg_clearance = int(np.mean(durations)) if durations else 45
    else:
        avg_clearance = 45 # default benchmark
        
    # Calculate road closure rate
    closures = db.query(Incident).filter(Incident.requires_road_closure == True).count()
    closure_rate = round((closures / total_incidents * 100), 1) if total_incidents > 0 else 0.0
    
    # Active Officers calculation
    # Simulate a dynamic officer allocation rate (e.g. 82% deployed)
    officers_deployed = active_incidents * 3 + 12
    officer_deployment_rate = min(95.0, round((officers_deployed / 150) * 100, 1))
    
    return {
        "total_incidents": total_incidents,
        "active_incidents": active_incidents,
        "avg_clearance_time_mins": avg_clearance,
        "road_closure_rate": closure_rate,
        "officer_deployment_rate": officer_deployment_rate
    }

@app.get("/api/dashboard/charts")
def get_dashboard_charts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    incidents = db.query(Incident).all()
    df = pd.DataFrame([{
        "id": i.id,
        "event_type": i.event_type,
        "zone": i.zone,
        "start_datetime": i.start_datetime,
        "priority": i.priority
    } for i in incidents])
    
    if df.empty:
        return {"event_types": [], "zones": [], "weekly_trends": []}
        
    # 1. Incident Breakdown by Type
    type_counts = df["event_type"].value_counts().to_dict()
    event_types = [{"name": k, "value": v} for k, v in type_counts.items()]
    
    # 2. Incident Breakdown by Zone
    zone_counts = df["zone"].value_counts().to_dict()
    zones = [{"zone": k, "count": v} for k, v in zone_counts.items()]
    
    # 3. Weekly Trends (grouped by last 7 days)
    # Generate 7 days ending today
    end_date = datetime.now().date()
    date_list = [end_date - timedelta(days=x) for x in range(7)]
    date_list.reverse()
    
    df["date"] = df["start_datetime"].apply(lambda x: x.date())
    weekly_trends = []
    for d in date_list:
        day_df = df[df["date"] == d]
        weekly_trends.append({
            "date": d.strftime("%a (%d %b)"),
            "Critical": int(sum(day_df["priority"] == "Critical")),
            "High": int(sum(day_df["priority"] == "High")),
            "Medium": int(sum(day_df["priority"] == "Medium")),
            "Low": int(sum(day_df["priority"] == "Low"))
        })
        
    return {
        "event_types": event_types,
        "zones": zones,
        "weekly_trends": weekly_trends
    }

# ----------------- Machine Learning & Prediction -----------------

SHAP_NAME_MAP = {
    "event_type_Accident": "Accident Incident Type",
    "event_type_Vehicle Breakdown": "Vehicle Breakdown",
    "event_type_Waterlogging": "Waterlogging Incident",
    "event_type_Road Repair": "Road Repair Activity",
    "event_type_Protest": "Protest / Demonstration",
    "event_type_VIP Movement": "VIP Convoy Movement",
    "event_type_Signal Failure": "Traffic Signal Failure",
    "event_type_Tree Fall": "Tree Fall Obstruction",
    "requires_road_closure": "Road Closure Required",
    "vehicle_type_Truck": "Heavy Vehicle (Truck) Involved",
    "vehicle_type_Bus": "Bus Involved",
    "vehicle_type_Car": "Car Involved",
    "vehicle_type_SUV": "SUV Involved",
    "vehicle_type_Two-Wheeler": "Two-Wheeler Involved",
    "vehicle_type_Auto-Rickshaw": "Auto-Rickshaw Involved",
    "priority_Critical": "Critical Priority Level",
    "priority_High": "High Priority Level",
    "priority_Medium": "Medium Priority Level",
    "priority_Low": "Low Priority Level",
    "latitude": "Location (North-South Position)",
    "longitude": "Location (East-West Position)",
    "corridor_Outer Ring Road": "Outer Ring Road Corridor",
    "corridor_Hosur Road": "Hosur Road Corridor",
    "corridor_Bellary Road": "Bellary Road Corridor",
    "corridor_Old Madras Road": "Old Madras Road Corridor",
    "corridor_Tumkur Road": "Tumkur Road Corridor",
    "corridor_Mysore Road": "Mysore Road Corridor",
    "corridor_Sarjapur Road": "Sarjapur Road Corridor",
    "corridor_Bannerghatta Road": "Bannerghatta Road Corridor",
    "zone_South Zone": "South Zone Area",
    "zone_North Zone": "North Zone Area",
    "zone_Central Zone": "Central Zone Area",
    "zone_East Zone": "East Zone Area",
    "zone_West Zone": "West Zone Area",
    "zone_Whitefield Zone": "Whitefield Zone Area",
}

def run_inference_helper(data: dict) -> dict:
    global preprocessor, xgb_clearance_model, cat_impact_model, rf_road_closure_model, shap_explainer, feature_names
    
    event_type = data.get("event_type", "Accident")
    event_cause = data.get("event_cause", "Collision")
    corridor = data.get("corridor", "Outer Ring Road")
    zone = data.get("zone", "South Zone")
    police_station = data.get("police_station", "Madiwala Traffic PS")
    junction = data.get("junction", "Silk Board Junction")
    priority = data.get("priority", "Medium")
    vehicle_type = data.get("vehicle_type", "Car")
    requires_road_closure = bool(data.get("requires_road_closure", False))
    lat = float(data.get("latitude", 12.9176))
    lon = float(data.get("longitude", 77.6244))
    
    # If ML Models are loaded, run official predictions
    if preprocessor and xgb_clearance_model:
        try:
            # Create dataframe for input
            input_df = pd.DataFrame([{
                "event_type": event_type,
                "event_cause": event_cause,
                "corridor": corridor,
                "zone": zone,
                "police_station": police_station,
                "junction": junction,
                "priority": priority,
                "vehicle_type": vehicle_type,
                "latitude": lat,
                "longitude": lon
            }])
            
            # Preprocess
            input_processed = preprocessor.transform(input_df)
            
            # Predict clearance time
            pred_time = float(xgb_clearance_model.predict(input_processed)[0])
            pred_time = max(10, int(pred_time))
            
            # Predict impact (CatBoost)
            impact_mapped = int(cat_impact_model.predict(input_processed)[0])
            impact_levels = {0: "Low", 1: "Medium", 2: "High"}
            pred_impact = impact_levels.get(impact_mapped, "Medium")
            
            # Predict road closure
            road_closure_prob = float(rf_road_closure_model.predict_proba(input_processed)[0][1])
            pred_road_closure = bool(rf_road_closure_model.predict(input_processed)[0])
            
            # Calculate SHAP explainability
            shap_values = shap_explainer.shap_values(input_processed)
            
            # Get the top contributing features for this prediction
            shap_contributions = []
            instance_shap = shap_values[0]
            top_indices = np.argsort(np.abs(instance_shap))[::-1][:5]
            
            # Map features to a readable name
            for idx in top_indices:
                feat_name = feature_names[idx]
                val = float(instance_shap[idx])
                
                # Format feature name for display in the frontend
                clean_name = feat_name.replace("cat__", "").replace("num__", "")
                for col in ["event_type", "event_cause", "corridor", "zone", "police_station", "junction", "priority", "vehicle_type"]:
                    if clean_name.startswith(col + "_"):
                        clean_name = col.replace("_", " ").title() + ": " + clean_name.replace(col + "_", "")
                        break
                if clean_name in ["latitude", "longitude"]:
                    clean_name = clean_name.title() + " Coordinate"
                    
                shap_contributions.append({
                    "feature": clean_name,
                    "contribution": round(val, 1)
                })
            
            confidence_clearance = round(75.0 + min(17.0, (pred_time / 180.0) * 17.0), 1)
            try:
                probs = cat_impact_model.predict_proba(input_processed)[0]
                confidence_impact = round(float(np.max(probs)) * 100.0, 1)
            except Exception:
                confidence_impact = 70.0
            
            confidence_closure = round(max(road_closure_prob, 1.0 - road_closure_prob) * 100.0, 1)
            
            # Map human explanations
            human_explanations = []
            for idx in top_indices:
                feat_name = feature_names[idx]
                val = float(instance_shap[idx])
                
                clean_key = feat_name.replace("cat__", "").replace("num__", "")
                mapped_name = SHAP_NAME_MAP.get(clean_key)
                if not mapped_name:
                    mapped_name = clean_key.replace("onehot__", "")
                    for col in ["event_type", "event_cause", "corridor", "zone", "police_station", "junction", "priority", "vehicle_type"]:
                        if mapped_name.startswith(col + "_"):
                            mapped_name = col.replace("_", " ").title() + ": " + mapped_name.replace(col + "_", "")
                            break
                    if mapped_name in ["latitude", "longitude"]:
                        mapped_name = mapped_name.title() + " Coordinate"
                
                effect = "increases" if val > 0 else "reduces"
                human_explanations.append(
                    f"{mapped_name} {effect} clearance time by {abs(round(val, 1))} mins"
                )
                
            return {
                "predicted_clearance_time_mins": pred_time,
                "predicted_impact_level": pred_impact,
                "requires_road_closure_prediction": pred_road_closure,
                "road_closure_probability": road_closure_prob,
                "shap_explainability": shap_contributions,
                "confidence_clearance": confidence_clearance,
                "confidence_impact": confidence_impact,
                "confidence_closure": confidence_closure,
                "clearance_range_min": round(pred_time * 0.85, 1),
                "clearance_range_max": round(pred_time * 1.15, 1),
                "human_explanations": human_explanations
            }
            
        except Exception as e:
            print(f"Prediction error: {e}. Fallback triggered.")
            
    # Fallback Rule-Based Predictor (Derived from dataset generation logic)
    base_clearance = 30
    event_additions = {
        "Accident": 50,
        "Vehicle Breakdown": 25,
        "Waterlogging": 90,
        "Road Repair": 150,
        "Protest": 120,
        "VIP Movement": 30,
        "Signal Failure": 20,
        "Tree Fall": 45
    }
    priority_additions = {
        "Low": -10,
        "Medium": 10,
        "High": 35,
        "Critical": 65
    }
    vehicle_additions = {
        "None": 0,
        "Two-Wheeler": -5,
        "Auto-Rickshaw": 0,
        "Car": 10,
        "SUV": 15,
        "Bus": 35,
        "Truck": 45
    }
    
    pred_time = base_clearance + event_additions.get(event_type, 30) + priority_additions.get(priority, 10) + vehicle_additions.get(vehicle_type, 0)
    if requires_road_closure:
        pred_time += 45
        
    pred_time = max(10, int(pred_time + np.random.randint(-5, 6)))
    
    # Impact level based on predicted clearance time
    if pred_time <= 45:
        pred_impact = "Low"
    elif pred_time <= 90:
        pred_impact = "Medium"
    else:
        pred_impact = "High"
        
    # Road closure probability
    closure_probs = {
        "VIP Movement": 0.95,
        "Protest": 0.90,
        "Accident": 0.65,
        "Waterlogging": 0.50,
        "Road Repair": 0.45,
        "Tree Fall": 0.20,
        "Vehicle Breakdown": 0.05,
        "Signal Failure": 0.01
    }
    road_closure_prob = closure_probs.get(event_type, 0.20)
    if priority == "Critical":
        road_closure_prob = min(0.99, road_closure_prob * 1.5)
        
    pred_road_closure = road_closure_prob > 0.5
    
    # Simulated SHAP values
    shap_contributions = [
        {"feature": f"Event Type: {event_type}", "contribution": round(event_additions.get(event_type, 30) * 0.7, 1)},
        {"feature": f"Priority: {priority}", "contribution": round(priority_additions.get(priority, 10) * 0.8, 1)},
        {"feature": f"Vehicle Type: {vehicle_type}", "contribution": round(vehicle_additions.get(vehicle_type, 0) * 0.9, 1)},
        {"feature": "Road Closure Required" if requires_road_closure else "No Road Closure", "contribution": 30.0 if requires_road_closure else -15.0},
        {"feature": f"Junction: {junction}", "contribution": round(np.random.normal(5, 2), 1)}
    ]
    shap_contributions.sort(key=lambda x: abs(x["contribution"]), reverse=True)
    
    confidence_clearance = round(65.0 + min(13.0, (pred_time / 180.0) * 13.0), 1)
    confidence_impact = 70.0
    confidence_closure = 75.0
    
    # Map human explanations
    human_explanations = []
    for item in shap_contributions:
        feat = item["feature"]
        val = item["contribution"]
        
        mapped_name = feat
        for k, v in SHAP_NAME_MAP.items():
            if v.lower() in feat.lower() or feat.lower() in v.lower():
                mapped_name = v
                break
                
        effect = "increases" if val > 0 else "reduces"
        human_explanations.append(
            f"{mapped_name} {effect} clearance time by {abs(round(val, 1))} mins"
        )
        
    return {
        "predicted_clearance_time_mins": pred_time,
        "predicted_impact_level": pred_impact,
        "requires_road_closure_prediction": pred_road_closure,
        "road_closure_probability": road_closure_prob,
        "shap_explainability": shap_contributions,
        "confidence_clearance": confidence_clearance,
        "confidence_impact": confidence_impact,
        "confidence_closure": confidence_closure,
        "clearance_range_min": round(pred_time * 0.85, 1),
        "clearance_range_max": round(pred_time * 1.15, 1),
        "human_explanations": human_explanations
    }

@app.post("/api/predict")
def predict_incident_metrics(incident_data: dict, current_user: User = Depends(get_current_user)):
    return run_inference_helper(incident_data)

# ----------------- Resource Recommendation -----------------

@app.post("/api/incidents/resources")
def recommend_resources(incident_data: dict, current_user: User = Depends(get_current_user)):
    priority = incident_data.get("priority", "Medium")
    event_type = incident_data.get("event_type", "Accident")
    vehicle_type = incident_data.get("vehicle_type", "Car")
    requires_road_closure = bool(incident_data.get("requires_road_closure", False))
    
    # Officers count
    base_officers = {"Low": 1, "Medium": 2, "High": 3, "Critical": 5}
    officers = base_officers.get(priority, 2)
    if event_type in ["Protest", "VIP Movement"]:
        officers += 3
    elif event_type == "Waterlogging":
        officers += 1
        
    # Barricades count
    barricades = 0
    if requires_road_closure:
        barricades_map = {"Low": 4, "Medium": 8, "High": 12, "Critical": 20}
        barricades = barricades_map.get(priority, 8)
    elif event_type == "Accident":
        barricades = 2
        
    # Tow trucks count
    tow_trucks = 0
    if event_type in ["Accident", "Vehicle Breakdown"]:
        if vehicle_type in ["Bus", "Truck"]:
            tow_trucks = 2 # heavy tow truck
        elif vehicle_type in ["Car", "SUV", "Auto-Rickshaw"]:
            tow_trucks = 1 # standard tow truck
            
    return {
        "traffic_officers": officers,
        "barricades": barricades,
        "tow_trucks": tow_trucks,
        "message": f"Recommended deployment: Dispatch {officers} Traffic Officers, deploy {barricades} Barricades, and dispatch {tow_trucks} Tow Trucks."
    }

# ----------------- DBSCAN Congestion Hotspots -----------------

@app.get("/api/hotspots")
def get_congestion_hotspots(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Fetch all active incidents
    active_incidents = db.query(Incident).filter(Incident.status == "Active").all()
    
    incidents_list = [{
        "id": inc.id,
        "latitude": inc.latitude,
        "longitude": inc.longitude,
        "priority": inc.priority
    } for inc in active_incidents]
    
    # Run DBSCAN (1 km search radius, min 3 incidents to cluster)
    hotspots = detect_hotspots(incidents_list, eps_km=1.2, min_samples=3)
    return hotspots

# ----------------- NetworkX Routing Endpoints -----------------

@app.post("/api/routing/diversion")
def calculate_diversion(routing_req: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    start = routing_req.get("start_junction")
    end = routing_req.get("end_junction")
    
    if not start or not end:
        raise HTTPException(status_code=400, detail="Start and End junctions are required.")
        
    # Fetch active incidents to penalize routing edges
    active_incidents = db.query(Incident).filter(Incident.status == "Active").all()
    incidents_list = [{
        "junction": inc.junction,
        "priority": inc.priority,
        "corridor": inc.corridor,
        "requires_road_closure": inc.requires_road_closure
    } for inc in active_incidents]
    
    route = get_diversion_route(start, end, incidents_list)
    if not route:
        raise HTTPException(status_code=404, detail="No route found between selected junctions.")
        
    # Secondary route and impact analysis
    sec_route = get_secondary_route(start, end, incidents_list)
    
    junction_zones = {
        "Silk Board Junction": "South Zone",
        "Tin Factory Junction": "East Zone",
        "Hebbal Flyover Junction": "North Zone",
        "Marathahalli Junction": "Whitefield Zone",
        "Domlur Junction": "Central Zone",
        "KR Puram Junction": "East Zone",
        "Richmond Circle": "Central Zone",
        "Gorguntepalya Junction": "West Zone",
        "Silk Institute Junction": "South Zone",
        "Sarjapur-ORR Junction": "South-East Zone"
    }
    zone = junction_zones.get(start, "Central Zone")
    
    normal_time = route.get("normal_time_mins", 15.0)
    est_time = route.get("estimated_time_mins", 15.0)
    
    delay_without_diversion = round(normal_time * 2.5, 1)
    delay_with_diversion = est_time
    improvement_pct = round(((delay_without_diversion - delay_with_diversion) / delay_without_diversion) * 100.0, 1) if delay_without_diversion > 0 else 0.0
    improvement_pct = max(0.0, improvement_pct)
    
    # Deterministic reduction between 15.0 and 30.0 based on start/end
    traffic_load_reduction_pct = round(15.0 + (hash(start + end) % 151) / 10.0, 1)
    affected_vehicles = estimate_affected_vehicles(zone)
    
    route["secondary_route"] = sec_route
    route["delay_without_diversion"] = delay_without_diversion
    route["delay_with_diversion"] = delay_with_diversion
    route["improvement_pct"] = improvement_pct
    route["traffic_load_reduction_pct"] = traffic_load_reduction_pct
    route["affected_vehicles"] = affected_vehicles
    
    return route

# ----------------- AI Copilot with RAG + ML Pipeline -----------------

def _extract_scenario_from_query(query_lower: str) -> dict | None:
    """Extract incident scenario parameters from a natural language query for ML prediction."""
    scenario = {}
    
    # Detect event type
    event_type_map = {
        "truck": ("Vehicle Breakdown", "Truck"),
        "bus": ("Vehicle Breakdown", "Bus"),
        "car": ("Accident", "Car"),
        "suv": ("Accident", "SUV"),
        "auto": ("Accident", "Auto-Rickshaw"),
        "two-wheeler": ("Accident", "Two-Wheeler"),
        "bike": ("Accident", "Two-Wheeler"),
        "breakdown": ("Vehicle Breakdown", "Car"),
        "breaks down": ("Vehicle Breakdown", "Car"),
        "accident": ("Accident", "Car"),
        "crash": ("Accident", "Car"),
        "collision": ("Accident", "Car"),
        "waterlogging": ("Waterlogging", "None"),
        "flood": ("Waterlogging", "None"),
        "rain": ("Waterlogging", "None"),
        "protest": ("Protest", "None"),
        "rally": ("Protest", "None"),
        "vip": ("VIP Movement", "None"),
        "road repair": ("Road Repair", "None"),
        "signal": ("Signal Failure", "None"),
        "tree": ("Tree Fall", "None"),
    }
    
    detected_event = None
    detected_vehicle = "Car"
    for keyword, (etype, vtype) in event_type_map.items():
        if keyword in query_lower:
            detected_event = etype
            detected_vehicle = vtype
            break
    
    # Detect junction/location
    junction_keywords = {
        "hebbal": ("Hebbal Flyover", 13.0358, 77.5970, "Bellary Road", "North Zone", "Hebbal Traffic PS"),
        "silk board": ("Silk Board Junction", 12.9176, 77.6244, "Hosur Road", "South-East Zone", "Madiwala Traffic PS"),
        "majestic": ("Majestic / KBS", 12.9767, 77.5713, "JC Road", "Central Zone", "Upparpet Traffic PS"),
        "kr puram": ("KR Puram", 13.0012, 77.6969, "Old Madras Road", "East Zone", "KR Puram Traffic PS"),
        "yeshwanthpur": ("Yeshwanthpur Circle", 13.0220, 77.5430, "Tumkur Road", "West Zone", "Yeshwanthpur Traffic PS"),
        "whitefield": ("Whitefield", 12.9698, 77.7500, "Whitefield Road", "East Zone", "Whitefield Traffic PS"),
        "koramangala": ("Koramangala", 12.9352, 77.6245, "Hosur Road", "South-East Zone", "Koramangala Traffic PS"),
        "jayanagar": ("Jayanagara 4th Block", 12.9250, 77.5938, "South End Circle", "South Zone", "Jayanagara Traffic PS"),
        "electronic city": ("Electronic City Flyover", 12.8456, 77.6603, "Hosur Road", "South-East Zone", "Electronic City Traffic PS"),
        "marathahalli": ("Marathahalli Bridge", 12.9591, 77.6974, "ORR East", "East Zone", "Marathahalli Traffic PS"),
        "bannerghatta": ("Bannerghatta Road", 12.8880, 77.5970, "Bannerghatta Road", "South Zone", "Bannerghatta Traffic PS"),
        "orr": ("Marathahalli Bridge", 12.9591, 77.6974, "Outer Ring Road", "East Zone", "Marathahalli Traffic PS"),
    }
    
    for keyword, (jname, lat, lon, corridor, zone, ps) in junction_keywords.items():
        if keyword in query_lower:
            scenario.update({
                "junction": jname, "latitude": lat, "longitude": lon,
                "corridor": corridor, "zone": zone, "police_station": ps
            })
            break
    
    # Detect priority
    if "critical" in query_lower or "emergency" in query_lower or "severe" in query_lower:
        scenario["priority"] = "Critical"
    elif "peak" in query_lower or "rush" in query_lower or "heavy" in query_lower:
        scenario["priority"] = "High"
    elif "minor" in query_lower or "small" in query_lower:
        scenario["priority"] = "Low"
    else:
        scenario["priority"] = "Medium"
    
    # Only return if we have at least an event type or junction
    if detected_event or "junction" in scenario:
        scenario.setdefault("event_type", detected_event or "Accident")
        scenario.setdefault("vehicle_type", detected_vehicle)
        scenario.setdefault("junction", "Unknown Junction")
        scenario.setdefault("latitude", 12.9716)
        scenario.setdefault("longitude", 77.5946)
        scenario.setdefault("corridor", "Unknown Corridor")
        scenario.setdefault("zone", "Central Zone")
        scenario.setdefault("police_station", "Unknown PS")
        scenario.setdefault("requires_road_closure", scenario["priority"] in ["Critical", "High"])
        return scenario
    
    return None


def _get_resource_recommendation(data: dict) -> dict:
    """Quick resource recommendation helper."""
    priority = data.get("priority", "Medium")
    event_type = data.get("event_type", "Accident")
    vehicle_type = data.get("vehicle_type", "Car")
    requires_road_closure = bool(data.get("requires_road_closure", False))
    
    base_officers = {"Low": 1, "Medium": 2, "High": 3, "Critical": 5}
    officers = base_officers.get(priority, 2)
    if event_type in ["Protest", "VIP Movement"]:
        officers += 3
    elif event_type == "Waterlogging":
        officers += 1
        
    barricades = 0
    if requires_road_closure:
        barricades_map = {"Low": 4, "Medium": 8, "High": 12, "Critical": 20}
        barricades = barricades_map.get(priority, 8)
    elif event_type == "Accident":
        barricades = 2
        
    tow_trucks = 0
    if event_type in ["Accident", "Vehicle Breakdown"]:
        if vehicle_type in ["Bus", "Truck"]:
            tow_trucks = 2
        elif vehicle_type in ["Car", "SUV", "Auto-Rickshaw"]:
            tow_trucks = 1
    
    return {"traffic_officers": officers, "barricades": barricades, "tow_trucks": tow_trucks}


@app.get("/api/forecast/congestion")
async def get_congestion_forecast(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Zone-level congestion risk forecast with time-series predictions."""
    from datetime import datetime, timedelta
    import random
    
    active = db.query(Incident).filter(Incident.status == "Active").all()
    
    # Count weighted incidents per zone
    zone_weights = {}
    priority_w = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}
    for inc in active:
        z = inc.zone
        w = priority_w.get(inc.priority, 1)
        zone_weights[z] = zone_weights.get(z, 0) + w
    
    # All zones with base risk
    all_zones = ["South Zone", "East Zone", "North Zone", "Whitefield Zone", "Central Zone", "North-East Zone", "West Zone", "South-East Zone"]
    
    now = datetime.now()
    hour = now.hour
    peak_mult = 1.5 if (8 <= hour <= 10 or 17 <= hour <= 20) else 1.0
    
    zone_forecasts = []
    for zone in all_zones:
        base_risk = min(95, int((zone_weights.get(zone, 0) * 12 + random.randint(20, 55)) * peak_mult))
        delay = max(5, int(base_risk * 0.32 + random.randint(-3, 5)))
        
        # Time series: 30min, 1h, 2h, 4h
        trend = []
        for t_offset in [30, 60, 120, 240]:
            decay = 1.0 - (t_offset / 600.0) + random.uniform(-0.1, 0.1)
            decay = max(0.3, min(1.2, decay))
            trend.append({
                "time_label": f"+{t_offset}min",
                "minutes_offset": t_offset,
                "risk_score": max(10, min(98, int(base_risk * decay))),
                "expected_delay": max(2, int(delay * decay))
            })
        
        zone_forecasts.append({
            "zone": zone,
            "risk_score": base_risk,
            "expected_delay_mins": delay,
            "trend": trend
        })
    
    zone_forecasts.sort(key=lambda x: x["risk_score"], reverse=True)
    return zone_forecasts

@app.get("/api/forecast/events")
async def get_event_forecasts(current_user = Depends(get_current_user)):
    """Forecast impact of upcoming/ongoing events."""
    events = [
        {"event_name": "Political Rally — Freedom Park", "impact": "High", "radius_km": 2.0, "expected_delay_mins": 35, "start_time": "16:00", "affected_corridors": ["Mysore Road", "Hosur Road"], "recommended_action": "Pre-deploy 5 officers and barricades at all entry points"},
        {"event_name": "Road Construction — Silk Board Flyover", "impact": "Medium", "radius_km": 1.0, "expected_delay_mins": 18, "start_time": "Ongoing", "affected_corridors": ["Hosur Road"], "recommended_action": "Activate diversion via Outer Ring Road"},
        {"event_name": "Cricket Match — M. Chinnaswamy Stadium", "impact": "High", "radius_km": 1.5, "expected_delay_mins": 28, "start_time": "19:30", "affected_corridors": ["Mysore Road", "Bellary Road"], "recommended_action": "Deploy traffic marshals 2 hours before event"},
        {"event_name": "Metro Construction — Whitefield", "impact": "Low", "radius_km": 0.5, "expected_delay_mins": 8, "start_time": "Ongoing", "affected_corridors": ["Outer Ring Road"], "recommended_action": "Monitor and adjust signal timing"},
        {"event_name": "VIP Convoy — Raj Bhavan Route", "impact": "Critical", "radius_km": 3.0, "expected_delay_mins": 45, "start_time": "10:00", "affected_corridors": ["Bellary Road", "Mysore Road"], "recommended_action": "Full road closure with pre-planned diversion routes"}
    ]
    return events

@app.get("/api/city-status")
async def get_city_status(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """City-wide operational status overview."""
    from datetime import datetime
    import random
    
    all_incidents = db.query(Incident).all()
    active = [i for i in all_incidents if i.status == "Active"]
    
    # Priority breakdown
    priority_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    zone_weights = {}
    priority_w = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}
    
    for inc in active:
        priority_counts[inc.priority] = priority_counts.get(inc.priority, 0) + 1
        w = priority_w.get(inc.priority, 1)
        zone_weights[inc.zone] = zone_weights.get(inc.zone, 0) + w
    
    # Most affected zone
    most_affected = max(zone_weights, key=zone_weights.get) if zone_weights else "None"
    
    # City Health Index (100 = perfect, 0 = chaos)
    weighted_active = sum(priority_w.get(i.priority, 1) for i in active)
    health_index = max(10, min(100, 100 - int(weighted_active * 2.5)))
    
    # Congestion index
    hour = datetime.now().hour
    peak_mult = 1.3 if (8 <= hour <= 10 or 17 <= hour <= 20) else 0.85
    congestion_index = min(100, int((weighted_active * 3.2 + random.randint(10, 25)) * peak_mult))
    
    return {
        "city_health_index": health_index,
        "active_incidents": len(active),
        "total_incidents": len(all_incidents),
        "priority_breakdown": priority_counts,
        "most_affected_zone": most_affected,
        "congestion_index": congestion_index,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/resources/utilization")
async def get_resource_utilization(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Current resource deployment status."""
    active = db.query(Incident).filter(Incident.status == "Active").all()
    
    # Simulate resource deployment based on active incidents
    base_officers = 60
    base_trucks = 12
    base_barricades = 150
    base_emergency = 10
    
    deployed_officers = min(base_officers, len(active) * 3 + 12)
    deployed_trucks = min(base_trucks, len([i for i in active if i.vehicle_type in ['Truck', 'Bus', 'SUV']]) * 2 + 2)
    deployed_barricades = min(base_barricades, len([i for i in active if i.requires_road_closure]) * 12 + 20)
    deployed_emergency = min(base_emergency, len([i for i in active if i.priority in ['Critical', 'High']]) * 2 + 1)
    
    return {
        "traffic_officers": {"active": deployed_officers, "total": base_officers},
        "tow_trucks": {"active": deployed_trucks, "total": base_trucks},
        "barricades": {"active": deployed_barricades, "total": base_barricades},
        "emergency_units": {"active": deployed_emergency, "total": base_emergency}
    }

@app.get("/api/incidents/prioritized")
async def get_prioritized_incidents(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Active incidents ranked by computed impact score."""
    from datetime import datetime
    
    active = db.query(Incident).filter(Incident.status == "Active").all()
    
    priority_weight = {"Critical": 25, "High": 18, "Medium": 12, "Low": 5}
    vehicle_weight = {"Truck": 10, "Bus": 8, "SUV": 5, "Car": 4, "Auto-Rickshaw": 3, "Two-Wheeler": 2, "None": 0}
    
    scored = []
    for inc in active:
        # Impact Score formula
        p_score = priority_weight.get(inc.priority, 5)
        closure_score = 20 if inc.requires_road_closure else 0
        vehicle_score = vehicle_weight.get(inc.vehicle_type, 3)
        
        # Time elapsed factor (longer unresolved = higher urgency)
        elapsed_mins = (datetime.utcnow() - inc.start_datetime).total_seconds() / 60.0 if inc.start_datetime else 0
        time_score = min(15, int(elapsed_mins / 20))
        
        # Zone congestion factor
        zone_incidents = len([i for i in active if i.zone == inc.zone])
        zone_score = min(15, zone_incidents * 5)
        
        impact_score = min(100, p_score + closure_score + vehicle_score + time_score + zone_score + 10)
        
        # Recommended action
        if impact_score >= 85:
            action = "Immediate multi-unit response. Deploy officers + tow trucks."
        elif impact_score >= 70:
            action = "Priority response. Deploy patrol unit and traffic diversion."
        elif impact_score >= 50:
            action = "Standard response. Monitor and deploy if escalated."
        else:
            action = "Low priority. Continue monitoring."
        
        scored.append({
            "id": inc.id,
            "event_type": inc.event_type,
            "event_cause": inc.event_cause,
            "junction": inc.junction,
            "corridor": inc.corridor,
            "zone": inc.zone,
            "priority": inc.priority,
            "vehicle_type": inc.vehicle_type,
            "requires_road_closure": inc.requires_road_closure,
            "impact_score": impact_score,
            "recommended_action": action,
            "start_datetime": inc.start_datetime.isoformat() if inc.start_datetime else None
        })
    
    scored.sort(key=lambda x: x["impact_score"], reverse=True)
    
    # Add rank
    for idx, item in enumerate(scored):
        item["rank"] = idx + 1
    
    return scored

@app.post("/api/simulator/what-if")
async def simulate_what_if(request: Request, current_user = Depends(get_current_user)):
    """Enhanced what-if simulation with resource adjustment sliders."""
    data = await request.json()
    
    # Extract resource slider values
    additional_officers = data.get("additional_officers", 0)
    additional_trucks = data.get("additional_trucks", 0)
    additional_barricades = data.get("additional_barricades", 0)
    
    # Run base prediction
    base_prediction = run_inference_helper(data)
    base_clearance = base_prediction.get("predicted_clearance_time_mins", 45)
    
    # Calculate resource impact
    officer_reduction = additional_officers * 0.03  # 3% per officer
    truck_reduction = additional_trucks * 0.05      # 5% per truck
    barricade_reduction = additional_barricades * 0.01  # 1% per barricade
    
    total_reduction = min(0.6, officer_reduction + truck_reduction + barricade_reduction)  # Cap at 60%
    adjusted_clearance = max(10, round(base_clearance * (1 - total_reduction), 1))
    improvement_pct = round((1 - adjusted_clearance / base_clearance) * 100, 1) if base_clearance > 0 else 0
    
    # Adjust impact level
    if adjusted_clearance <= 30:
        adjusted_impact = "Low"
    elif adjusted_clearance <= 60:
        adjusted_impact = "Medium"
    else:
        adjusted_impact = "High"
    
    return {
        "base_prediction": base_prediction,
        "adjusted_clearance_time_mins": adjusted_clearance,
        "adjusted_impact_level": adjusted_impact,
        "improvement_pct": improvement_pct,
        "total_reduction_factor": round(total_reduction * 100, 1),
        "resource_breakdown": {
            "officers_effect": round(officer_reduction * 100, 1),
            "trucks_effect": round(truck_reduction * 100, 1),
            "barricades_effect": round(barricade_reduction * 100, 1)
        }
    }

@app.get("/api/reports/commissioner")
async def generate_commissioner_report(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Generate and download commissioner-level executive PDF report."""
    # Gather all data
    all_incidents = db.query(Incident).all()
    active = [i for i in all_incidents if i.status == "Active"]
    
    # Stats
    cleared = [i for i in all_incidents if i.status == "Cleared" and i.end_datetime and i.start_datetime]
    avg_clear = 0
    if cleared:
        times = [(i.end_datetime - i.start_datetime).total_seconds() / 60.0 for i in cleared]
        valid_times = [t for t in times if 0 < t < 1440]
        avg_clear = round(sum(valid_times) / len(valid_times), 1) if valid_times else 0
    
    road_closures = len([i for i in active if i.requires_road_closure])
    closure_rate = round(road_closures / len(active) * 100, 1) if active else 0
    
    stats_data = {
        "total_incidents": len(all_incidents),
        "active_incidents": len(active),
        "avg_clearance_time_mins": avg_clear,
        "road_closure_rate": closure_rate,
        "officer_deployment_rate": round(min(100, len(active) * 5 + 40), 1)
    }
    
    # Active incidents as dicts
    active_dicts = [{
        "event_type": i.event_type,
        "junction": i.junction,
        "corridor": i.corridor,
        "zone": i.zone,
        "priority": i.priority
    } for i in active]
    
    # Hotspots
    inc_list = [{"latitude": i.latitude, "longitude": i.longitude, "priority": i.priority, "id": i.id} for i in active]
    hotspots = detect_hotspots(inc_list, eps_km=1.2, min_samples=3) if len(inc_list) >= 3 else []
    
    # Generate PDF
    pdf_buffer = generate_commissioner_report_pdf(stats_data, active_dicts, hotspots)
    
    from datetime import datetime
    filename = f"SmartFlow_Commissioner_Report_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.post("/api/copilot/chat")
def copilot_chat(
    chat_req: dict, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = chat_req.get("query", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
        
    # ===== STEP 1: Build RAG Context from DB =====
    active_incidents = db.query(Incident).filter(Incident.status == "Active").all()
    total_active = len(active_incidents)
    critical_active = sum(1 for i in active_incidents if i.priority == "Critical")
    high_active = sum(1 for i in active_incidents if i.priority == "High")
    medium_active = sum(1 for i in active_incidents if i.priority == "Medium")
    low_active = sum(1 for i in active_incidents if i.priority == "Low")
    
    # Incident type breakdown
    type_counts = {}
    for inc in active_incidents:
        type_counts[inc.event_type] = type_counts.get(inc.event_type, 0) + 1
    type_breakdown = ", ".join(f"{k}: {v}" for k, v in sorted(type_counts.items(), key=lambda x: -x[1]))
    
    # Top incident summaries
    incident_summaries = []
    for inc in active_incidents[:8]:
        incident_summaries.append(
            f"- [{inc.priority}] {inc.event_type} at {inc.junction} ({inc.corridor}, Zone: {inc.zone})"
        )
    incidents_context = "\n".join(incident_summaries) if incident_summaries else "No active incidents."
    
    # ===== STEP 2: Run DBSCAN Hotspot Detection =====
    hotspots = detect_hotspots([{
        "id": inc.id, "latitude": inc.latitude, "longitude": inc.longitude, "priority": inc.priority
    } for inc in active_incidents], eps_km=1.2, min_samples=3)
    
    hotspot_context = ""
    if hotspots:
        hotspot_lines = []
        for h in hotspots:
            hotspot_lines.append(
                f"- Cluster #{h['id']}: {h['incident_count']} incidents near ({round(h['latitude'],4)}, {round(h['longitude'],4)}), Severity: {h['severity']}"
            )
        hotspot_context = f"DBSCAN detected {len(hotspots)} congestion hotspot clusters:\n" + "\n".join(hotspot_lines)
    else:
        hotspot_context = "DBSCAN analysis: No major congestion clusters detected."
    
    # ===== STEP 3: Extract scenario from query and run ML predictions =====
    query_lower = query.lower()
    ml_prediction_context = ""
    scenario_data = _extract_scenario_from_query(query_lower)
    
    if scenario_data:
        try:
            predictions = run_inference_helper(scenario_data)
            resources = _get_resource_recommendation(scenario_data)
            
            shap_list = []
            for s in predictions.get('shap_explainability', [])[:3]:
                feat = s.get('feature', 'Unknown')
                contrib = s.get('contribution', 0)
                sign = "+" if contrib > 0 else ""
                shap_list.append(f"{feat} ({sign}{contrib})")
            shap_factors_str = ", ".join(shap_list) if shap_list else "None"
            
            ml_prediction_context = (
                f"\nML MODEL PREDICTIONS FOR THIS SCENARIO:\n"
                f"- Event Type: {scenario_data.get('event_type', 'Unknown')}\n"
                f"- Location: {scenario_data.get('junction', 'Unknown Junction')}\n"
                f"- Priority: {scenario_data.get('priority', 'Medium')}\n"
                f"- Vehicle: {scenario_data.get('vehicle_type', 'Car')}\n"
                f"- Predicted Clearance Time: {predictions['predicted_clearance_time_mins']} minutes\n"
                f"- Predicted Impact Level: {predictions['predicted_impact_level']}\n"
                f"- Road Closure Required: {'Yes' if predictions['requires_road_closure_prediction'] else 'No'} "
                f"(Probability: {round(predictions.get('road_closure_probability', 0) * 100)}%)\n"
                f"- Key SHAP Factors: {shap_factors_str}\n"
                f"\nRESOURCE DEPLOYMENT RECOMMENDATION:\n"
                f"- Traffic Officers: {resources['traffic_officers']}\n"
                f"- Barricades: {resources['barricades']}\n"
                f"- Tow Trucks: {resources['tow_trucks']}\n"
            )
        except Exception as e:
            print(f"ML prediction for copilot failed: {e}")
    
    # ===== STEP 4: Build comprehensive prompt =====
    full_context = (
        f"=== REAL-TIME BENGALURU COMMAND CENTER INTELLIGENCE ===\n"
        f"Total Active Incidents: {total_active}\n"
        f"Priority Breakdown: Critical={critical_active}, High={high_active}, Medium={medium_active}, Low={low_active}\n"
        f"Incident Type Distribution: {type_breakdown or 'None'}\n\n"
        f"Recent Active Incidents:\n{incidents_context}\n\n"
        f"{hotspot_context}\n"
        f"{ml_prediction_context}\n"
        f"SOP QUICK REFERENCE:\n"
        f"- Accident: Deploy tow trucks. Clear within 45min. Setup barricades. Call 108 if casualties.\n"
        f"- Waterlogging: Divert traffic. Notify BBMP. Deploy suction pumps.\n"
        f"- Protest: Double-layer barricades. Coordinate with Law & Order Police.\n"
        f"- VIP Movement: Clear corridors 15min prior. No civilian heavy vehicles.\n"
        f"- Vehicle Breakdown: Dispatch tow truck. Setup warning cones. Direct traffic to adjacent lane.\n"
        f"========================================================\n"
    )
    
    # ===== STEP 5: Try Gemini API =====
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        models_to_try = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"]
        
        for model_name in models_to_try:
            try:
                from google import genai
                client = genai.Client(api_key=gemini_key)
                
                prompt = (
                    f"You are SMARTFLOW AI, an expert traffic command copilot for Bengaluru Traffic Police.\n"
                    f"Answer the officer's query using the context below. Be specific, actionable, and concise.\n"
                    f"If ML predictions are available, explain them in plain language.\n"
                    f"Use markdown formatting (bold for key numbers, bullet points for steps).\n\n"
                    f"{full_context}\n"
                    f"Officer's Query: {query}\n\n"
                    f"Provide a direct, professional, actionable response:"
                )
                
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt
                )
                return {"response": response.text}
                
            except Exception as e:
                error_str = str(e)
                print(f"Gemini [{model_name}] Error: {error_str}")
                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                    continue
                break
    
    # ===== STEP 6: Intelligent Rule-Based Fallback =====
    summary_str = f"Currently, there are **{total_active} active incidents** in Bengaluru, with **{critical_active} marked as Critical** and **{high_active} as High priority**."
    
    # --- SCENARIO-BASED QUESTIONS ---
    if scenario_data and ml_prediction_context:
        event_type = scenario_data.get("event_type", "Incident")
        junction = scenario_data.get("junction", "the specified location")
        response_text = f"**🚨 Scenario Analysis: {event_type} at {junction}**\n\n"
        response_text += ml_prediction_context.strip() + "\n\n"
        response_text += f"**📊 Current City Status:** {summary_str}\n\n"
        
        sop_map = {
            "Accident": "**SOP Actions:**\n1. Dispatch 108 Ambulance if casualties reported\n2. Deploy tow trucks to clear carriageway\n3. Setup barricades and redirect traffic\n4. Document scene and push vehicles to hard shoulder",
            "Vehicle Breakdown": "**SOP Actions:**\n1. Dispatch tow truck to remove vehicle\n2. Deploy warning cones/triangles\n3. Direct traffic to adjacent lanes\n4. If heavy vehicle, deploy heavy-duty tow truck and consider partial road closure",
            "Waterlogging": "**SOP Actions:**\n1. Alert BBMP emergency crews immediately\n2. Deploy portable suction pumps\n3. Activate graph-based diversion routes\n4. Erect hazard barricades 100m before waterlogged stretch",
            "Protest": "**SOP Actions:**\n1. Setup double-layer barricades\n2. Coordinate with Law & Order Police\n3. Divert ORR traffic to alternate routes\n4. Deploy additional officers for crowd management",
            "VIP Movement": "**SOP Actions:**\n1. Clear corridor 15 minutes prior\n2. Block civilian heavy vehicles on route\n3. Deploy escort team\n4. Coordinate with protocol division",
        }
        response_text += sop_map.get(event_type, "**SOP Actions:** Deploy officers, setup barricades, and manage traffic flow as per standard protocol.")
        return {"response": response_text}
    
    # --- HOTSPOT / CONGESTION QUERIES ---
    if any(kw in query_lower for kw in ["hotspot", "congestion", "cluster", "dense", "crowded"]):
        if hotspots:
            hotspot_details = []
            for h in hotspots:
                hotspot_details.append(f"- **Cluster #{h['id']}:** {h['incident_count']} incidents near ({round(h['latitude'],4)}, {round(h['longitude'],4)}), Severity: **{h['severity']}**")
            return {"response": (f"**📡 DBSCAN Spatial Analysis Report**\n\n{summary_str}\n\n"
                    f"We detected **{len(hotspots)} active congestion hotspot clusters**:\n" + 
                    "\n".join(hotspot_details) + 
                    "\n\n**🎯 Action Recommended:** Deploy patrol bikes to these coordinates. Prioritize HIGH severity clusters.")}
        else:
            return {"response": f"**📡 DBSCAN Analysis:** {summary_str}\n\nNo major congestion clusters detected (min 3 incidents within 1.2km). Traffic flow remains distributed."}
    
    # --- STATUS / SUMMARY QUERIES ---
    if any(kw in query_lower for kw in ["status", "summarize", "summary", "report", "today", "overview", "dashboard", "active"]):
        response_text = f"**📋 Bengaluru Command Center Summary Report**\n\n{summary_str}\n\n"
        if active_incidents:
            type_breakdown_lines = "\n".join(f"- **{k}:** {v} incidents" for k, v in sorted(type_counts.items(), key=lambda x: -x[1]))
            response_text += f"**Incident Type Breakdown:**\n{type_breakdown_lines}\n\n"
            response_text += f"**Recent Active Incidents:**\n{incidents_context}\n\n"
            if hotspots:
                response_text += f"**⚠️ {len(hotspots)} congestion hotspot clusters detected.** Use 'hotspot radar' to view details."
        else:
            response_text += "✅ No active incidents currently logged. Traffic flow is normal."
        return {"response": response_text}
    
    # --- SOP: WATERLOGGING ---
    if any(kw in query_lower for kw in ["waterlogging", "rain", "flood", "water"]):
        active_wl = [inc for inc in active_incidents if "Waterlogging" in inc.event_type]
        status = f"\n\n**Active Waterlogging Incidents:** {len(active_wl)} currently reported." if active_wl else "\n\n✅ No active waterlogging incidents reported."
        return {"response": ("**🌧️ SOP: Waterlogging & Heavy Rain Mitigation**\n\n"
                "1. **Alert Civic Agencies:** Dispatch BBMP emergency response crews.\n"
                "2. **Pumping Systems:** Deploy portable water suction pumps.\n"
                "3. **Diversion Routine:** Activate graph-based diversions.\n"
                "4. **Warning Signs:** Erect hazard barricades 100m prior.\n"
                "5. **Communication:** Alert commuters via radio and signboards." + status)}
    
    # --- SOP: ACCIDENT ---
    if any(kw in query_lower for kw in ["accident", "crash", "collision"]):
        active_acc = [inc for inc in active_incidents if "Accident" in inc.event_type]
        status = f"\n\n**Active Accident Incidents:** {len(active_acc)} currently reported." if active_acc else "\n\n✅ No active accident incidents reported."
        return {"response": ("**🚗 SOP: Road Accident Clearance**\n\n"
                "1. **Medical Response:** Dispatch 108 Ambulance if casualties reported.\n"
                "2. **Towing:** Deploy tow trucks (heavy for buses/trucks).\n"
                "3. **Clearance Target:** Clear within 45 minutes.\n"
                "4. **Resource Deployment:** Deploy 2-3 officers to redirect traffic.\n"
                "5. **Investigation:** Document coordinates, vehicles, skid marks." + status)}
    
    # --- SOP: PROTEST ---
    if any(kw in query_lower for kw in ["protest", "rally", "demonstration"]):
        return {"response": ("**✊ SOP: Protest & Rally Management**\n\n"
                "1. **Barricades:** Setup double-layer barricades at all access points.\n"
                "2. **Police Coordination:** Coordinate with Law & Order Police.\n"
                "3. **Traffic Diversion:** Divert ORR and arterial road traffic.\n"
                "4. **Reinforcement:** Deploy additional 5-8 officers.\n"
                "5. **Communication:** Issue advance traffic advisory.")}
    
    # --- SOP: VIP ---
    if any(kw in query_lower for kw in ["vip", "minister", "dignitary", "escort"]):
        return {"response": ("**🏛️ SOP: VIP Movement Protocol**\n\n"
                "1. **Corridor Clearance:** Clear corridors 15 minutes prior.\n"
                "2. **Vehicle Restriction:** No civilian heavy vehicles on VIP route.\n"
                "3. **Escort Team:** Deploy motorcycle escort and pilot vehicle.\n"
                "4. **Signal Override:** Coordinate green corridor with BTMC.\n"
                "5. **Standby:** Keep backup route ready.")}
    
    # --- SOP: GENERAL ---
    if any(kw in query_lower for kw in ["sop", "procedure", "rule", "protocol"]):
        return {"response": ("**📚 SMARTFLOW AI Standard Operating Procedures**\n\n"
                "Available SOPs:\n"
                "- *'SOP for accidents'*\n- *'SOP for waterlogging'*\n"
                "- *'SOP for VIP movements'*\n- *'SOP for protests'*\n\n"
                "You can also describe a scenario like:\n"
                "- *'What if a truck breaks down at Hebbal during peak hours?'*\n"
                "- *'Accident at Silk Board involving a bus'*")}
    
    # --- OFFICER / RESOURCE QUERIES ---
    if any(kw in query_lower for kw in ["officer", "deploy", "resource", "barricade", "tow"]):
        return {"response": (f"**👮 Resource Deployment Status**\n\n{summary_str}\n\n"
                "Describe an incident scenario to get ML-powered resource recommendations:\n"
                "- *'How many officers for a bus accident at Marathahalli?'*\n"
                "- *'Resources needed for waterlogging at Electronic City'*")}
    
    # --- GENERIC HELP ---
    return {"response": (f"**🤖 SMARTFLOW AI Traffic Copilot**\n\n{summary_str}\n\n"
            "I can help you with:\n\n"
            "**📊 Live Monitoring:**\n- *'Summarize active incidents'*\n- *'Show hotspot radar'*\n\n"
            "**🔮 Scenario Analysis (ML-Powered):**\n"
            "- *'What if a truck breaks down at Hebbal during peak hours?'*\n"
            "- *'Accident at Silk Board involving a bus'*\n"
            "- *'Waterlogging near Electronic City'*\n\n"
            "**📋 SOPs & Protocols:**\n- *'SOP for road accidents'*\n- *'VIP movement protocol'*")}


# ----------------- PDF Report Download -----------------

@app.get("/api/incidents/{incident_id}/report")
def download_incident_report(incident_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
        
    # Format incident as dict
    incident_data = {
        "id": incident.id,
        "event_type": incident.event_type,
        "event_cause": incident.event_cause,
        "latitude": incident.latitude,
        "longitude": incident.longitude,
        "corridor": incident.corridor,
        "zone": incident.zone,
        "police_station": incident.police_station,
        "junction": incident.junction,
        "priority": incident.priority,
        "requires_road_closure": incident.requires_road_closure,
        "vehicle_type": incident.vehicle_type,
        "start_datetime": incident.start_datetime.strftime("%Y-%m-%d %H:%M:%S"),
        "end_datetime": incident.end_datetime.strftime("%Y-%m-%d %H:%M:%S") if incident.end_datetime else "N/A",
        "status": incident.status
    }
    
    # Run predictions, resources, and routing to compile full report
    predictions = run_inference_helper(incident_data)
    
    # Resources
    base_rec = recommend_resources(incident_data, current_user=None)
    
    # Diversions
    active_incidents = db.query(Incident).filter(Incident.status == "Active").all()
    incidents_list = [{
        "junction": inc.junction,
        "priority": inc.priority,
        "corridor": inc.corridor,
        "requires_road_closure": inc.requires_road_closure
    } for inc in active_incidents]
    
    # Find an alternative path. If none, route to Richmond Circle as placeholder
    start = incident.junction
    end = "Richmond Circle"
    if start == end:
        end = "Silk Board Junction"
        
    diversions = get_diversion_route(start, end, incidents_list)
    if not diversions:
        diversions = {"path": [start, end], "diversion_details": "Direct path suggested."}
        
    # Generate PDF
    pdf_buffer = generate_incident_pdf(incident_data, predictions, base_rec, diversions)
    
    filename = f"Incident_Report_BTP_SF_{incident.id}.pdf"
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
