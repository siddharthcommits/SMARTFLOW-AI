import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN

def detect_hotspots(incidents_list, eps_km=1.0, min_samples=3):
    """
    Detect congestion hotspots using DBSCAN clustering.
    incidents_list: List of dicts, each with 'id', 'latitude', 'longitude', 'priority'
    eps_km: radius of cluster in kilometers (roughly 0.009 degrees per km in lat/lon)
    """
    if len(incidents_list) < min_samples:
        return []
        
    # Extract coordinates
    coords = np.array([[inc['latitude'], inc['longitude']] for inc in incidents_list])
    
    # 1 km is roughly 0.009 degrees
    eps_degrees = eps_km * 0.009
    
    db = DBSCAN(eps=eps_degrees, min_samples=min_samples, metric='euclidean').fit(coords)
    labels = db.labels_
    
    unique_labels = set(labels)
    hotspots = []
    
    for k in unique_labels:
        if k == -1:
            # Noise points
            continue
            
        class_member_mask = (labels == k)
        cluster_coords = coords[class_member_mask]
        
        # Calculate centroid
        centroid_lat = float(np.mean(cluster_coords[:, 0]))
        centroid_lon = float(np.mean(cluster_coords[:, 1]))
        
        # Get incidents in this cluster
        cluster_incidents = [incidents_list[i] for i, mask in enumerate(class_member_mask) if mask]
        count = len(cluster_incidents)
        
        # Determine severity based on density and incident priorities
        has_critical = any(inc.get('priority') == 'Critical' for inc in cluster_incidents)
        has_high = any(inc.get('priority') == 'High' for inc in cluster_incidents)
        
        if count >= 8 or has_critical:
            severity = "Critical"
        elif count >= 5 or has_high:
            severity = "Severe"
        else:
            severity = "Moderate"
            
        hotspots.append({
            "id": int(k),
            "latitude": centroid_lat,
            "longitude": centroid_lon,
            "incident_count": count,
            "severity": severity,
            "incidents": [inc['id'] for inc in cluster_incidents]
        })
        
    return hotspots
