import sys
sys.path.append('c:/Users/hp/Desktop/EventManager')

from backend.database import get_db, Incident
from backend.ml.routing import get_diversion_route, get_secondary_route, JUNCTION_COORDS
import networkx as nx

db = next(get_db())
active_incidents = db.query(Incident).filter(Incident.status == "Active").all()
incidents_list = [{
    "junction": inc.junction,
    "priority": inc.priority,
    "corridor": inc.corridor,
    "requires_road_closure": inc.requires_road_closure
} for inc in active_incidents]

junctions = list(JUNCTION_COORDS.keys())
errors = []

for u in junctions:
    for v in junctions:
        if u == v:
            continue
        try:
            route = get_diversion_route(u, v, incidents_list)
            if not route:
                errors.append((u, v, "get_diversion_route returned None"))
            else:
                # Test secondary route
                sec = get_secondary_route(u, v, incidents_list)
        except Exception as e:
            errors.append((u, v, f"Raised exception: {e}"))

if errors:
    print(f"Found {len(errors)} errors:")
    for err in errors:
        print(f"  {err[0]} -> {err[1]}: {err[2]}")
else:
    print("All junction pairs routed successfully!")
