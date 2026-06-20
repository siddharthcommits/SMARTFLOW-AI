import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta

# Set random seed for reproducibility
np.random.seed(42)
random.seed(42)

# Define Bengaluru traffic junctions and their associated metadata to create realistic spatial features
JUNCTION_METADATA = [
    {
        "junction": "Silk Board Junction",
        "latitude": 12.9176,
        "longitude": 77.6244,
        "police_station": "Madiwala Traffic PS",
        "zone": "South Zone",
        "corridor": "Hosur Road"
    },
    {
        "junction": "Tin Factory Junction",
        "latitude": 12.9881,
        "longitude": 77.6710,
        "police_station": "K R Puram Traffic PS",
        "zone": "East Zone",
        "corridor": "Old Madras Road"
    },
    {
        "junction": "Hebbal Flyover Junction",
        "latitude": 13.0359,
        "longitude": 77.5970,
        "police_station": "Hebbal Traffic PS",
        "zone": "North Zone",
        "corridor": "Bellary Road"
    },
    {
        "junction": "Marathahalli Junction",
        "latitude": 12.9562,
        "longitude": 77.6967,
        "police_station": "Whitefield Traffic PS",
        "zone": "Whitefield Zone",
        "corridor": "Outer Ring Road"
    },
    {
        "junction": "Domlur Junction",
        "latitude": 12.9610,
        "longitude": 77.6387,
        "police_station": "Indiranagar Traffic PS",
        "zone": "Central Zone",
        "corridor": "Outer Ring Road"
    },
    {
        "junction": "KR Puram Junction",
        "latitude": 13.0040,
        "longitude": 77.6980,
        "police_station": "K R Puram Traffic PS",
        "zone": "North-East Zone",
        "corridor": "Outer Ring Road"
    },
    {
        "junction": "Richmond Circle",
        "latitude": 12.9602,
        "longitude": 77.5938,
        "police_station": "Halasuru Gate Traffic PS",
        "zone": "Central Zone",
        "corridor": "Mysore Road"
    },
    {
        "junction": "Gorguntepalya Junction",
        "latitude": 13.0286,
        "longitude": 77.5408,
        "police_station": "Yeshwanthpur Traffic PS",
        "zone": "West Zone",
        "corridor": "Tumkur Road"
    },
    {
        "junction": "Silk Institute Junction",
        "latitude": 12.8596,
        "longitude": 77.5385,
        "police_station": "Kanakapura Road Traffic PS",
        "zone": "South-East Zone",
        "corridor": "Bannerghatta Road"
    },
    {
        "junction": "Sarjapur-ORR Junction",
        "latitude": 12.9265,
        "longitude": 77.6762,
        "police_station": "HSR Layout Traffic PS",
        "zone": "South-East Zone",
        "corridor": "Sarjapur Road"
    }
]

EVENT_MAPPING = {
    "Accident": ("Collision", ["Car", "Two-Wheeler", "SUV", "Bus", "Truck", "Auto-Rickshaw"]),
    "Vehicle Breakdown": ("Engine Overheating", ["Car", "SUV", "Bus", "Truck", "Auto-Rickshaw", "Two-Wheeler"]),
    "Waterlogging": ("Heavy Rain", ["None"]),
    "Road Repair": ("Pothole Maintenance", ["None"]),
    "Protest": ("Public Demonstration", ["None"]),
    "VIP Movement": ("Official Visit", ["None"]),
    "Signal Failure": ("Power Outage", ["None"]),
    "Tree Fall": ("Strong Winds", ["None"])
}

PRIORITY_LEVELS = ["Low", "Medium", "High", "Critical"]

def generate_dataset(num_records=3000):
    data = []
    
    # Starting date: 90 days ago
    start_date_pool = datetime.now() - timedelta(days=90)
    
    for i in range(num_records):
        # 1. Pick a random base junction
        junc = random.choice(JUNCTION_METADATA)
        
        # 2. Add spatial jitter (Gaussian noise ~ 200m - 500m)
        lat = junc["latitude"] + np.random.normal(0, 0.003)
        lon = junc["longitude"] + np.random.normal(0, 0.003)
        
        # 3. Select event type & map cause/vehicle
        event_type = random.choice(list(EVENT_MAPPING.keys()))
        cause, vehicles = EVENT_MAPPING[event_type]
        vehicle_type = random.choice(vehicles)
        
        # 4. Determine priority & road closure based on event type
        if event_type in ["VIP Movement", "Protest"]:
            priority = random.choice(["High", "Critical"])
            requires_closure = True if random.random() > 0.1 else False
        elif event_type == "Waterlogging":
            priority = random.choice(["Medium", "High", "Critical"])
            requires_closure = True if random.random() > 0.4 else False
        elif event_type == "Accident":
            priority = random.choice(["Medium", "High", "Critical"])
            requires_closure = True if random.random() > 0.6 else False
        elif event_type == "Road Repair":
            priority = random.choice(["Low", "Medium", "High"])
            requires_closure = True if random.random() > 0.3 else False
        else: # Breakdown, Signal Failure, Tree Fall
            priority = random.choice(["Low", "Medium", "High"])
            requires_closure = True if random.random() > 0.9 else False
            
        # 5. Generate start time (randomly spread over 90 days)
        random_minutes = random.randint(0, 90 * 24 * 60)
        start_time = start_date_pool + timedelta(minutes=random_minutes)
        
        # 6. Calculate clearance time in minutes (our target variable)
        # Base clearance time depending on event type
        base_times = {
            "Accident": 50,
            "Vehicle Breakdown": 25,
            "Waterlogging": 90,
            "Road Repair": 150,
            "Protest": 120,
            "VIP Movement": 30,
            "Signal Failure": 20,
            "Tree Fall": 45
        }
        
        clearance_time = base_times[event_type]
        
        # Adjust for priority
        priority_multipliers = {
            "Low": 0.8,
            "Medium": 1.0,
            "High": 1.3,
            "Critical": 1.8
        }
        clearance_time *= priority_multipliers[priority]
        
        # Adjust for road closure
        if requires_closure:
            clearance_time += random.randint(30, 60)
            
        # Adjust for vehicle type (larger vehicles take longer to clear)
        vehicle_additions = {
            "None": 0,
            "Two-Wheeler": -5,
            "Auto-Rickshaw": 0,
            "Car": 10,
            "SUV": 15,
            "Bus": 35,
            "Truck": 45
        }
        clearance_time += vehicle_additions[vehicle_type]
        
        # Add random noise/variance (std of 10 minutes)
        noise = np.random.normal(0, 12)
        clearance_time = max(10, int(clearance_time + noise))
        
        end_time = start_time + timedelta(minutes=clearance_time)
        
        data.append({
            "event_type": event_type,
            "event_cause": cause,
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "corridor": junc["corridor"],
            "zone": junc["zone"],
            "police_station": junc["police_station"],
            "junction": junc["junction"],
            "priority": priority,
            "requires_road_closure": requires_closure,
            "vehicle_type": vehicle_type,
            "start_datetime": start_time.strftime("%Y-%m-%d %H:%M:%S"),
            "end_datetime": end_time.strftime("%Y-%m-%d %H:%M:%S")
        })
        
    df = pd.DataFrame(data)
    df.to_csv("c:/Users/hp/Desktop/EventManager/backend/ml/traffic_incidents.csv", index=False)
    print(f"Successfully generated {num_records} records in traffic_incidents.csv!")

if __name__ == "__main__":
    generate_dataset()
