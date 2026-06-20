import os
import pandas as pd
import numpy as np

def preprocess_dataset():
    input_path = r"C:\Users\hp\Downloads\Astram event data_anonymized - Astram event data_anonymizedb40ac87(1).csv"
    output_path = r"c:\Users\hp\Desktop\EventManager\backend\ml\traffic_incidents.csv"
    
    if not os.path.exists(input_path):
        print(f"Error: Input dataset not found at {input_path}")
        return
        
    print(f"Loading raw dataset from {input_path}...")
    df = pd.read_csv(input_path)
    
    # 1. Parse and filter datetimes
    df['start_dt'] = pd.to_datetime(df['start_datetime'], errors='coerce')
    df['resolved_dt'] = pd.to_datetime(df['resolved_datetime'], errors='coerce')
    df['closed_dt'] = pd.to_datetime(df['closed_datetime'], errors='coerce')
    df['end_dt'] = pd.to_datetime(df['end_datetime'], errors='coerce')
    
    # Combined end datetime
    combined_end_dt = df['resolved_dt'].fillna(df['closed_dt']).fillna(df['end_dt'])
    df['clearance_time'] = (combined_end_dt - df['start_dt']).dt.total_seconds() / 60.0
    
    # Filter for valid clearance times (between 5 minutes and 24 hours)
    df_filtered = df[(df['clearance_time'] >= 5) & (df['clearance_time'] <= 1440)].copy()
    print(f"Filtered {len(df)} rows down to {len(df_filtered)} rows with valid clearance times (5m - 24h).")
    
    # 2. Map coordinates
    df_filtered['latitude'] = df_filtered['latitude'].fillna(12.9716)
    df_filtered['longitude'] = df_filtered['longitude'].fillna(77.5946)
    
    # 3. Requires road closure
    df_filtered['requires_road_closure'] = df_filtered['requires_road_closure'].astype(str).str.upper() == 'TRUE'
    
    # 4. Map event_type & event_cause
    def map_event_type(cause):
        cause = str(cause).lower().strip()
        if 'accident' in cause:
            return "Accident"
        elif 'breakdown' in cause:
            return "Vehicle Breakdown"
        elif cause in ['pot_holes', 'construction', 'road_conditions', 'debris']:
            return "Road Repair"
        elif 'water' in cause:
            return "Waterlogging"
        elif cause in ['protest', 'procession', 'public_event']:
            return "Protest"
        elif 'vip' in cause:
            return "VIP Movement"
        elif 'signal' in cause or 'congestion' in cause:
            return "Signal Failure"
        else:
            return "Other"
            
    def map_event_cause(cause):
        cause = str(cause).lower().strip()
        if 'breakdown' in cause:
            return "Breakdown"
        elif 'accident' in cause:
            return "Accident"
        elif 'pot_holes' in cause or 'pothole' in cause:
            return "Potholes"
        elif 'construction' in cause:
            return "Construction"
        elif 'water' in cause:
            return "Waterlogging"
        elif 'tree' in cause:
            return "Tree Fall"
        elif 'road_conditions' in cause:
            return "Road Conditions"
        elif 'congestion' in cause:
            return "Congestion"
        elif 'public_event' in cause:
            return "Public Event"
        elif 'procession' in cause:
            return "Procession"
        elif 'vip' in cause:
            return "VIP Movement"
        elif 'protest' in cause:
            return "Protest"
        elif 'debris' in cause:
            return "Debris"
        else:
            return "Other"

    df_filtered['event_type'] = df_filtered['event_cause'].apply(map_event_type)
    df_filtered['event_cause'] = df_filtered['event_cause'].apply(map_event_cause)
    
    # 5. Map priority
    def map_priority(row):
        pri = str(row['priority']).strip()
        closure = row['requires_road_closure']
        if pri == 'High' and closure:
            return "Critical"
        elif pri == 'High':
            return "High"
        elif pri == 'Low' and closure:
            return "Medium"
        else:
            return "Low"
            
    df_filtered['priority'] = df_filtered.apply(map_priority, axis=1)
    
    # 6. Map vehicle_type
    def map_vehicle_type(vtype):
        v = str(vtype).lower().strip()
        if pd.isna(vtype) or v == 'nan' or v == 'none' or v == '':
            return "None"
        elif 'bus' in v:
            return "Bus"
        elif 'truck' in v or 'heavy' in v:
            return "Truck"
        elif 'lcv' in v:
            return "LCV"
        elif 'car' in v or 'taxi' in v:
            return "Car"
        elif 'auto' in v:
            return "Auto-Rickshaw"
        else:
            return "Other"
            
    df_filtered['vehicle_type'] = df_filtered['veh_type'].apply(map_vehicle_type)
    
    # 7. Map corridor
    def map_corridor(corr):
        c = str(corr).strip()
        if pd.isna(corr) or c == 'nan' or c == 'Non-corridor' or c == '':
            return "Other Corridor"
        return c
        
    df_filtered['corridor'] = df_filtered['corridor'].apply(map_corridor)
    
    # 8. Map zone
    def map_zone(row):
        zone_val = str(row['zone']).strip()
        ps = str(row['police_station']).lower()
        corr = str(row['corridor']).lower()
        
        # If zone is valid, clean and map it
        if pd.notna(row['zone']) and zone_val != 'nan' and zone_val != '':
            if 'central' in zone_val.lower():
                return "Central Zone"
            elif 'east' in zone_val.lower():
                return "East Zone"
            elif 'west' in zone_val.lower():
                return "West Zone"
            elif 'north' in zone_val.lower():
                return "North Zone"
            elif 'south' in zone_val.lower():
                return "South Zone"
                
        # Fallbacks based on police station
        if any(x in ps for x in ['hsr', 'electronic', 'madiwala', 'koramangala']):
            return "South-East Zone"
        elif any(x in ps for x in ['whitefield', 'k.r. pura', 'kr puram', 'mahadevapura', 'hal old airport', 'banaswadi']):
            return "Whitefield Zone"
        elif any(x in ps for x in ['hebbala', 'yelahanka', 'kodigehalli']):
            return "North Zone"
        elif any(x in ps for x in ['yeshwanthpura', 'jalahalli', 'kamakshipalya', 'peenya']):
            return "West Zone"
        elif any(x in ps for x in ['halasuru gate', 'cubbon', 'chamarajpet', 'wilson', 'sadashiva']):
            return "Central Zone"
            
        # Fallbacks based on corridor
        if 'orr east' in corr:
            return "South-East Zone"
        elif 'orr north' in corr or 'bellary' in corr:
            return "North Zone"
        elif 'tumkur' in corr or 'orr west' in corr:
            return "West Zone"
        elif 'old madras' in corr:
            return "Whitefield Zone"
        elif 'hosur' in corr:
            return "South Zone"
            
        return "Central Zone"

    df_filtered['zone'] = df_filtered.apply(map_zone, axis=1)
    
    # 9. Clean Police Station
    def clean_ps(ps):
        p = str(ps).strip()
        if pd.isna(ps) or p == 'nan' or p == 'No Police Station' or p == '':
            return "General Traffic PS"
        if not p.lower().endswith('ps'):
            return f"{p} Traffic PS"
        return p
        
    df_filtered['police_station'] = df_filtered['police_station'].apply(clean_ps)
    
    # 10. Clean Junction
    def clean_junction(row):
        j = str(row['junction']).strip()
        addr = str(row['address']).lower()
        if pd.isna(row['junction']) or j == 'nan' or j == '':
            # Try to guess junction from address
            if 'circle' in addr:
                # Find the circle word
                words = addr.split(',')
                for w in words:
                    if 'circle' in w:
                        return w.strip().title()
            if 'junction' in addr:
                words = addr.split(',')
                for w in words:
                    if 'junction' in w:
                        return w.strip().title()
            return f"Junction near {row['police_station']}"
        return j
        
    df_filtered['junction'] = df_filtered.apply(clean_junction, axis=1)
    
    # 11. Format dates for database seeding
    df_filtered['start_datetime'] = df_filtered['start_dt'].dt.strftime('%Y-%m-%d %H:%M:%S')
    df_filtered['end_datetime'] = df_filtered['end_dt'].fillna(combined_end_dt).dt.strftime('%Y-%m-%d %H:%M:%S')
    
    # Keep only target columns
    target_cols = [
        'event_type', 'event_cause', 'latitude', 'longitude', 'corridor', 'zone',
        'police_station', 'junction', 'priority', 'requires_road_closure',
        'vehicle_type', 'start_datetime', 'end_datetime'
    ]
    
    df_out = df_filtered[target_cols].copy()
    
    print(f"Saving cleaned dataset to {output_path}...")
    df_out.to_csv(output_path, index=False)
    print("Pre-processing complete! Shape:", df_out.shape)

if __name__ == "__main__":
    preprocess_dataset()
