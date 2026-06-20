import networkx as nx

# Define the static Bengaluru road network graph of key junctions
JUNCTION_COORDS = {
    "Silk Board Junction": (12.9176, 77.6244),
    "Tin Factory Junction": (12.9881, 77.6710),
    "Hebbal Flyover Junction": (13.0359, 77.5970),
    "Marathahalli Junction": (12.9562, 77.6967),
    "Domlur Junction": (12.9610, 77.6387),
    "KR Puram Junction": (13.0040, 77.6980),
    "Richmond Circle": (12.9602, 77.5938),
    "Gorguntepalya Junction": (13.0286, 77.5408),
    "Silk Institute Junction": (12.8596, 77.5385),
    "Sarjapur-ORR Junction": (12.9265, 77.6762)
}

# Base travel times in minutes (corridor distance/typical traffic)
ROAD_EDGES = [
    ("Silk Board Junction", "Sarjapur-ORR Junction", 8.0, "Outer Ring Road"),
    ("Sarjapur-ORR Junction", "Marathahalli Junction", 12.0, "Outer Ring Road"),
    ("Marathahalli Junction", "Domlur Junction", 15.0, "Old Airport Road"),
    ("Domlur Junction", "Richmond Circle", 10.0, "Hosur Road"),
    ("Richmond Circle", "Gorguntepalya Junction", 22.0, "Tumkur Road"),
    ("Gorguntepalya Junction", "Hebbal Flyover Junction", 18.0, "Outer Ring Road"),
    ("Hebbal Flyover Junction", "Tin Factory Junction", 20.0, "Outer Ring Road"),
    ("Tin Factory Junction", "KR Puram Junction", 5.0, "Old Madras Road"),
    ("KR Puram Junction", "Marathahalli Junction", 14.0, "Outer Ring Road"),
    ("Silk Board Junction", "Richmond Circle", 18.0, "Hosur Road"),
    ("Silk Board Junction", "Silk Institute Junction", 25.0, "Kanakapura Road"),
    ("Silk Institute Junction", "Richmond Circle", 30.0, "Kanakapura Road"),
    ("Sarjapur-ORR Junction", "KR Puram Junction", 20.0, "Outer Ring Road")
]

def build_traffic_graph(active_incidents=None):
    """
    Builds a NetworkX graph with dynamically adjusted travel times based on active incidents.
    """
    G = nx.Graph()
    
    # Add nodes
    for name, coords in JUNCTION_COORDS.items():
        G.add_node(name, latitude=coords[0], longitude=coords[1])
        
    # Add edges with base weights
    for u, v, weight, corridor in ROAD_EDGES:
        G.add_edge(u, v, weight=weight, base_weight=weight, corridor=corridor)
        
    if not active_incidents:
        return G
        
    # Adjust weights based on active incidents
    for incident in active_incidents:
        junc = incident.get("junction")
        priority = incident.get("priority", "Low")
        closure = incident.get("requires_road_closure", False)
        
        # Determine congestion factor
        factor = 1.5
        if priority == "Critical":
            factor = 4.0
        elif priority == "High":
            factor = 2.5
        elif priority == "Medium":
            factor = 1.8
            
        if closure:
            factor *= 2.5 # Extremely heavy delay / closed road
            
        # If incident is at a specific junction, penalize all edges connected to this junction
        if junc in G.nodes:
            for neighbor in list(G.neighbors(junc)):
                current_w = G[junc][neighbor]["weight"]
                # Apply penalty factor (maximum penalty wins)
                G[junc][neighbor]["weight"] = max(current_w, G[junc][neighbor]["base_weight"] * factor)
                
        # Also check corridor penalty
        corr = incident.get("corridor")
        if corr:
            for u, v in G.edges:
                if G[u][v]["corridor"] == corr:
                    current_w = G[u][v]["weight"]
                    G[u][v]["weight"] = max(current_w, G[u][v]["base_weight"] * factor)
                    
    return G

def get_diversion_route(start, end, active_incidents=None):
    """
    Finds the shortest path between start and end. If an incident affects the path,
    the weights are adjusted, and an alternative diversion path is recommended.
    """
    if start not in JUNCTION_COORDS or end not in JUNCTION_COORDS:
        return None
        
    # Build graphs
    G_base = build_traffic_graph(active_incidents=None)
    G_congested = build_traffic_graph(active_incidents)
    
    try:
        # Standard route under normal conditions
        normal_path = nx.shortest_path(G_base, source=start, target=end, weight="weight")
        normal_time = nx.shortest_path_length(G_base, source=start, target=end, weight="weight")
        
        # Dynamic route under current traffic conditions
        dynamic_path = nx.shortest_path(G_congested, source=start, target=end, weight="weight")
        dynamic_time = nx.shortest_path_length(G_congested, source=start, target=end, weight="weight")
        
        # Check if the route is diverted
        is_diverted = normal_path != dynamic_path
        
        path_details = []
        for i in range(len(dynamic_path)):
            node = dynamic_path[i]
            path_details.append({
                "name": node,
                "latitude": JUNCTION_COORDS[node][0],
                "longitude": JUNCTION_COORDS[node][1]
            })
            
        return {
            "path": dynamic_path,
            "path_coordinates": path_details,
            "estimated_time_mins": round(dynamic_time, 1),
            "normal_time_mins": round(normal_time, 1),
            "is_diverted": is_diverted,
            "diversion_details": "Route adjusted to bypass incidents along " + (", ".join(
                set([G_congested[dynamic_path[i]][dynamic_path[i+1]]["corridor"] for i in range(len(dynamic_path)-1)])
            )) if is_diverted else "Direct route is optimal."
        }
    except nx.NetworkXNoPath:
        return None


def get_secondary_route(start_junction, end_junction, active_incidents):
    """Find secondary diversion route by removing the most congested edge from primary route."""
    G_congested = build_traffic_graph(active_incidents)
    G_base = build_traffic_graph([])
    
    try:
        primary_path = nx.shortest_path(G_congested, start_junction, end_junction, weight='weight')
        primary_time = sum(G_congested[primary_path[i]][primary_path[i+1]]['weight'] for i in range(len(primary_path)-1))
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None
    
    # Find most congested edge in primary path and remove it
    max_weight = 0
    max_edge = None
    for i in range(len(primary_path)-1):
        w = G_congested[primary_path[i]][primary_path[i+1]]['weight']
        if w > max_weight:
            max_weight = w
            max_edge = (primary_path[i], primary_path[i+1])
    
    if max_edge:
        G_secondary = G_congested.copy()
        G_secondary.remove_edge(*max_edge)
        try:
            secondary_path = nx.shortest_path(G_secondary, start_junction, end_junction, weight='weight')
            secondary_time = sum(G_secondary[secondary_path[i]][secondary_path[i+1]]['weight'] for i in range(len(secondary_path)-1))
            
            secondary_coords = [JUNCTION_COORDS[j] for j in secondary_path if j in JUNCTION_COORDS]
            
            return {
                "path": secondary_path,
                "path_coordinates": [{"latitude": c[0], "longitude": c[1]} for c in secondary_coords],
                "estimated_time_mins": round(secondary_time, 1),
                "route_name": f"{secondary_path[1]} Route" if len(secondary_path) > 1 else "Alternate Route"
            }
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None
    return None


def estimate_affected_vehicles(zone, hour=None):
    """Estimate affected vehicles based on zone and time of day."""
    import random
    if hour is None:
        from datetime import datetime
        hour = datetime.now().hour
    
    base_vehicles = {
        "South Zone": 850, "East Zone": 620, "North Zone": 780,
        "Whitefield Zone": 700, "Central Zone": 920, "North-East Zone": 550,
        "West Zone": 640, "South-East Zone": 580
    }
    base = base_vehicles.get(zone, 500)
    
    # Peak hour multipliers
    if 8 <= hour <= 10 or 17 <= hour <= 20:
        multiplier = 1.8
    elif 11 <= hour <= 16:
        multiplier = 1.2
    else:
        multiplier = 0.6
    
    return int(base * multiplier + random.randint(-50, 50))
