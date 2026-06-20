import os
import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
import xgboost as xgb
from catboost import CatBoostClassifier
import shap

def train_models():
    # Paths
    base_dir = "c:/Users/hp/Desktop/EventManager/backend/ml"
    csv_path = os.path.join(base_dir, "traffic_incidents.csv")
    models_dir = os.path.join(base_dir, "models")
    os.makedirs(models_dir, exist_ok=True)
    
    if not os.path.exists(csv_path):
        print(f"Dataset not found at {csv_path}. Please run generate_data.py first.")
        return
        
    df = pd.read_csv(csv_path)
    
    # Calculate target variables
    # 1. Clearance Time (Regression target)
    df['start_datetime'] = pd.to_datetime(df['start_datetime'])
    df['end_datetime'] = pd.to_datetime(df['end_datetime'])
    df['clearance_time'] = (df['end_datetime'] - df['start_datetime']).dt.total_seconds() / 60.0
    
    # 2. Incident Impact (Classification target)
    def assign_impact(row):
        if row['clearance_time'] <= 45:
            return "Low"
        elif row['clearance_time'] <= 90:
            return "Medium"
        else:
            return "High"
    df['incident_impact'] = df.apply(assign_impact, axis=1)
    
    # Define features
    cat_cols = ['event_type', 'event_cause', 'corridor', 'zone', 'police_station', 'junction', 'priority', 'vehicle_type']
    num_cols = ['latitude', 'longitude']
    
    # Define features and targets for our tasks
    X = df[cat_cols + num_cols]
    y_clearance = df['clearance_time']
    y_impact = df['incident_impact']
    y_closure = df['requires_road_closure'].astype(int) # 0 or 1
    
    # Split datasets
    X_train, X_test, y_train_clr, y_test_clr = train_test_split(X, y_clearance, test_size=0.2, random_state=42)
    _, _, y_train_imp, y_test_imp = train_test_split(X, y_impact, test_size=0.2, random_state=42)
    _, _, y_train_cls, y_test_cls = train_test_split(X, y_closure, test_size=0.2, random_state=42)
    
    # 1. Preprocessor Setup
    preprocessor = ColumnTransformer(
        transformers=[
            ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), cat_cols),
            ('num', StandardScaler(), num_cols)
        ]
    )
    
    # Fit preprocessor on full features to ensure consistency
    X_train_processed = preprocessor.fit_transform(X_train)
    X_test_processed = preprocessor.transform(X_test)
    
    # Get preprocessed feature names for SHAP explainability
    cat_encoder = preprocessor.named_transformers_['cat']
    encoded_cat_names = cat_encoder.get_feature_names_out(cat_cols).tolist()
    feature_names = encoded_cat_names + num_cols
    
    print("Preprocessing complete. Total features:", len(feature_names))
    
    # 2. Train XGBoost Regressor (Clearance Time)
    print("Training XGBoost Regressor for Clearance Time...")
    xgb_reg = xgb.XGBRegressor(
        n_estimators=150,
        max_depth=6,
        learning_rate=0.08,
        random_state=42,
        objective='reg:squarederror'
    )
    xgb_reg.fit(X_train_processed, y_train_clr)
    print(f"XGBoost Test R2 Score: {xgb_reg.score(X_test_processed, y_test_clr):.4f}")
    
    # 3. Train CatBoost Classifier (Incident Impact)
    print("Training CatBoost Classifier for Incident Impact...")
    # CatBoost works well with the preprocessed variables too, but let's label encode the target first
    impact_mapping = {"Low": 0, "Medium": 1, "High": 2}
    y_train_imp_mapped = y_train_imp.map(impact_mapping)
    y_test_imp_mapped = y_test_imp.map(impact_mapping)
    
    cat_clf = CatBoostClassifier(
        iterations=200,
        depth=6,
        learning_rate=0.1,
        random_seed=42,
        verbose=0
    )
    cat_clf.fit(X_train_processed, y_train_imp_mapped)
    print(f"CatBoost Test Accuracy: {cat_clf.score(X_test_processed, y_test_imp_mapped):.4f}")
    
    # 4. Train RandomForest Classifier (Road Closure)
    print("Training RandomForest Classifier for Road Closure Requirements...")
    rf_clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=8,
        random_state=42
    )
    rf_clf.fit(X_train_processed, y_train_cls)
    print(f"RandomForest Test Accuracy: {rf_clf.score(X_test_processed, y_test_cls):.4f}")
    
    # 5. Initialize SHAP Explainer (on XGBoost Regressor for clearance time)
    print("Initializing SHAP Explainer...")
    # We use a tree explainer on a small subset of training data (100 samples) to speed up predictions
    bg_data = X_train_processed[np.random.choice(X_train_processed.shape[0], 100, replace=False)]
    explainer = shap.TreeExplainer(xgb_reg, data=bg_data)
    
    # Save assets
    joblib.dump(preprocessor, os.path.join(models_dir, "preprocessor.joblib"))
    joblib.dump(xgb_reg, os.path.join(models_dir, "xgb_clearance_model.joblib"))
    joblib.dump(cat_clf, os.path.join(models_dir, "cat_impact_model.joblib"))
    joblib.dump(rf_clf, os.path.join(models_dir, "rf_road_closure_model.joblib"))
    joblib.dump(explainer, os.path.join(models_dir, "shap_explainer.joblib"))
    
    # Save feature names list for UI alignment
    joblib.dump(feature_names, os.path.join(models_dir, "feature_names.joblib"))
    
    print("All models and explainer saved successfully!")

if __name__ == "__main__":
    train_models()
