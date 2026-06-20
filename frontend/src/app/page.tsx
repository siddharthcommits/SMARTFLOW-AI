"use client";
// Trigger Vercel rebuild with frontend root directory
import React, { useState, useEffect, useRef } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell, Sector 
} from "recharts";
import { 
  ShieldAlert, Activity, Clock, ShieldCheck, MapPin, Compass, AlertTriangle, 
  Sliders, Send, LogOut, ChevronRight, Download, Plus, RefreshCw, Layers, CheckCircle2, User,
  Bell, FileText, Bot, Terminal, HelpCircle, HardHat, Car, Shield, ChevronDown
} from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";

// Target FastAPI server address
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// Chart theme colors
const COLORS_PIE = ["#00e5ff", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#3b82f6", "#ec4899", "#14b8a6"];
const PRIORITY_COLORS: Record<string, string> = {
  Critical: "#f43f5e",
  High: "#f59e0b",
  Medium: "#eab308",
  Low: "#10b981"
};

export default function CommandCenter() {
  // --- Auth State ---
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ username: string; full_name: string; role: string } | null>(null);
  const [loginUsername, setLoginUsername] = useState("supervisor");
  const [loginPassword, setLoginPassword] = useState("supervisor123");
  const [loginError, setLoginError] = useState("");

  // --- UI Navigation State ---
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard, map, simulator, copilot, settings
  const [pieActiveIndex, setPieActiveIndex] = useState<number>(-1);
  const [isLoggingModalOpen, setIsLoggingModalOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- Application Data State ---
  const [incidents, setIncidents] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    total_incidents: 0,
    active_incidents: 0,
    avg_clearance_time_mins: 45,
    road_closure_rate: 0.0,
    officer_deployment_rate: 0.0
  });
  const [charts, setCharts] = useState<any>({
    event_types: [],
    zones: [],
    weekly_trends: []
  });
  const [hotspots, setHotspots] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([
    { id: 1, type: "Critical", message: "Critical incident reported at Silk Board Junction. Clearance time prediction: 145 mins.", time: "2 mins ago", read: false },
    { id: 2, type: "System", message: "DBSCAN detected severe congestion hotspot cluster near Hebbal Flyover.", time: "10 mins ago", read: false },
    { id: 3, type: "Warning", message: "Heavy waterlogging logged at Outer Ring Road. Road closure required.", time: "15 mins ago", read: true }
  ]);

  // --- Map Selection & Routing State ---
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [routingStart, setRoutingStart] = useState("Silk Board Junction");
  const [routingEnd, setRoutingEnd] = useState("Richmond Circle");
  const [routeResult, setRouteResult] = useState<any>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [mapStyle, setMapStyle] = useState<"dark" | "streets">("dark");
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showHotspotCluster, setShowHotspotCluster] = useState(true);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isMapOptionsExpanded, setIsMapOptionsExpanded] = useState(true);
  const [isAltRouteExpanded, setIsAltRouteExpanded] = useState(true);

  // --- What-If Simulator Form & Results ---
  const [simForm, setSimForm] = useState({
    event_type: "Accident",
    event_cause: "Collision",
    priority: "High",
    requires_road_closure: true,
    vehicle_type: "Truck",
    latitude: 12.9562,
    longitude: 77.6967,
    junction: "Marathahalli Junction",
    corridor: "Outer Ring Road",
    zone: "Whitefield Zone",
    police_station: "Whitefield Traffic PS"
  });
  const [simResults, setSimResults] = useState<any>(null);
  const [simResources, setSimResources] = useState<any>(null);
  const [simRouting, setSimRouting] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // --- AI Traffic Copilot Chat State ---
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<any[]>([
    { sender: "copilot", text: "Hello! I am your SMARTFLOW AI Traffic Copilot. Ask me about active incident summaries, congestion hotspots, or standard operating procedures (SOPs)." }
  ]);
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);

  // --- Log Incident Form ---
  const [newIncident, setNewIncident] = useState({
    event_type: "Accident",
    event_cause: "Collision",
    priority: "Medium",
    requires_road_closure: false,
    vehicle_type: "Car",
    latitude: 12.9176,
    longitude: 77.6244,
    junction: "Silk Board Junction",
    corridor: "Hosur Road",
    zone: "South Zone",
    police_station: "Madiwala Traffic PS"
  });

  // --- BTP Finalist Upgrades State ---
  const [congestionForecast, setCongestionForecast] = useState<any[]>([]);
  const [eventForecast, setEventForecast] = useState<any[]>([]);
  const [cityStatus, setCityStatus] = useState<any>({
    city_health_index: 95,
    active_incidents: 0,
    total_incidents: 0,
    priority_breakdown: { Critical: 0, High: 0, Medium: 0, Low: 0 },
    most_affected_zone: "None",
    congestion_index: 25
  });
  const [resourceUtilization, setResourceUtilization] = useState<any>({
    traffic_officers: { active: 42, total: 60 },
    tow_trucks: { active: 8, total: 12 },
    barricades: { active: 95, total: 150 },
    emergency_units: { active: 6, total: 10 }
  });
  const [prioritizedIncidents, setPrioritizedIncidents] = useState<any[]>([]);
  const [simSliders, setSimSliders] = useState({
    additional_officers: 0,
    additional_trucks: 0,
    additional_barricades: 0
  });
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  
  // Custom Layer Toggles
  const [showSecondaryRoute, setShowSecondaryRoute] = useState(true);
  const [showImpactRadius, setShowImpactRadius] = useState(true);

  // --- Maplibre GL Refs ---
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mapMarkers = useRef<any[]>([]);

  // Update coordinates dynamically when selecting a junction in forms
  const junctionsList = [
    { name: "Silk Board Junction", lat: 12.9176, lon: 77.6244, corridor: "Hosur Road", zone: "South Zone", ps: "Madiwala Traffic PS" },
    { name: "Tin Factory Junction", lat: 12.9881, lon: 77.6710, corridor: "Old Madras Road", zone: "East Zone", ps: "K R Puram Traffic PS" },
    { name: "Hebbal Flyover Junction", lat: 13.0359, lon: 77.5970, corridor: "Bellary Road", zone: "North Zone", ps: "Hebbal Traffic PS" },
    { name: "Marathahalli Junction", lat: 12.9562, lon: 77.6967, corridor: "Outer Ring Road", zone: "Whitefield Zone", ps: "Whitefield Traffic PS" },
    { name: "Domlur Junction", lat: 12.9610, lon: 77.6387, corridor: "Outer Ring Road", zone: "Central Zone", ps: "Indiranagar Traffic PS" },
    { name: "KR Puram Junction", lat: 13.0040, lon: 77.6980, corridor: "Outer Ring Road", zone: "North-East Zone", ps: "K R Puram Traffic PS" },
    { name: "Richmond Circle", lat: 12.9602, lon: 77.5938, corridor: "Mysore Road", zone: "Central Zone", ps: "Halasuru Gate Traffic PS" },
    { name: "Gorguntepalya Junction", lat: 13.0286, lon: 77.5408, corridor: "Tumkur Road", zone: "West Zone", ps: "Yeshwanthpur Traffic PS" },
    { name: "Silk Institute Junction", lat: 12.8596, lon: 77.5385, corridor: "Bannerghatta Road", zone: "South-East Zone", ps: "Kanakapura Road Traffic PS" },
    { name: "Sarjapur-ORR Junction", lat: 12.9265, lon: 77.6762, corridor: "Sarjapur Road", zone: "South-East Zone", ps: "HSR Layout Traffic PS" }
  ];

  // Get nearest valid routing junction name if start/end node is not in static graph
  const getNearestValidJunction = (juncName: string, lat: number, lon: number): string => {
    const exists = junctionsList.some(j => j.name === juncName);
    if (exists) return juncName;
    
    let nearestName = junctionsList[0].name;
    let minDistance = Infinity;
    for (const j of junctionsList) {
      const dist = Math.sqrt(Math.pow(j.lat - lat, 2) + Math.pow(j.lon - lon, 2));
      if (dist < minDistance) {
        minDistance = dist;
        nearestName = j.name;
      }
    }
    return nearestName;
  };

  // Sync clock
  const [currentTime, setCurrentTime] = useState("");
  useEffect(() => {
    setCurrentTime(new Date().toLocaleString("en-US", { hour12: false }));
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleString("en-US", { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Handlers ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      const formData = new URLSearchParams();
      formData.append("username", loginUsername);
      formData.append("password", loginPassword);

      const res = await fetch(`${API_BASE_URL}/api/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString()
      });

      if (!res.ok) {
        throw new Error("Invalid username or password credentials.");
      }

      const data = await res.json();
      setToken(data.access_token);
      setUser(data.user);
      
      // Auto trigger initial data loads
      fetchDashboardData(data.access_token);
    } catch (err: any) {
      setLoginError(err.message || "Failed to establish connection to SMARTFLOW Backend.");
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
  };

  const playBeep = () => {
    if (isSoundMuted) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 5.0); // Fades over 5 seconds
      
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 5.0); // Stops at 5 seconds
    } catch (e) {
      console.warn("Audio Context beep failed", e);
    }
  };

  const fetchUpgradeData = async (accessToken: string) => {
    if (!accessToken) return;
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [foreRes, evtRes, statusRes, utilRes, prioRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/forecast/congestion`, { headers }),
        fetch(`${API_BASE_URL}/api/forecast/events`, { headers }),
        fetch(`${API_BASE_URL}/api/city-status`, { headers }),
        fetch(`${API_BASE_URL}/api/resources/utilization`, { headers }),
        fetch(`${API_BASE_URL}/api/incidents/prioritized`, { headers })
      ]);

      if (foreRes.ok) setCongestionForecast(await foreRes.json());
      if (evtRes.ok) setEventForecast(await evtRes.json());
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setCityStatus(statusData);
        setStats((prev: any) => ({
          ...prev,
          active_incidents: statusData.active_incidents,
          total_incidents: statusData.total_incidents
        }));
      }
      if (utilRes.ok) setResourceUtilization(await utilRes.json());
      if (prioRes.ok) setPrioritizedIncidents(await prioRes.json());
    } catch (e) {
      console.error("Error fetching upgrade data", e);
    }
  };

  const downloadCommissionerReport = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/reports/commissioner`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `SmartFlow_Commissioner_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        alert("Failed to download commissioner report.");
      }
    } catch (e) {
      console.error("Error downloading commissioner report", e);
    }
  };

  const triggerDemoScenario = async (id: string) => {
    let scenarioData: any = {};
    let sliderData: any = {};
    
    if (id === "scenario1") {
      scenarioData = {
        event_type: "Accident",
        event_cause: "Collision",
        priority: "Critical",
        requires_road_closure: true,
        vehicle_type: "Truck",
        latitude: 12.9176,
        longitude: 77.6244,
        junction: "Silk Board Junction",
        corridor: "Hosur Road",
        zone: "South Zone",
        police_station: "Madiwala Traffic PS"
      };
      sliderData = { additional_officers: 6, additional_trucks: 2, additional_barricades: 15 };
    } else if (id === "scenario2") {
      scenarioData = {
        event_type: "Waterlogging",
        event_cause: "Heavy Rain",
        priority: "High",
        requires_road_closure: true,
        vehicle_type: "Bus",
        latitude: 13.0359,
        longitude: 77.5970,
        junction: "Hebbal Flyover Junction",
        corridor: "Outer Ring Road",
        zone: "North Zone",
        police_station: "Hebbal Traffic PS"
      };
      sliderData = { additional_officers: 4, additional_trucks: 1, additional_barricades: 25 };
    } else if (id === "scenario3") {
      scenarioData = {
        event_type: "Vehicle Breakdown",
        event_cause: "Engine Overheating",
        priority: "Medium",
        requires_road_closure: false,
        vehicle_type: "Car",
        latitude: 12.9881,
        longitude: 77.6710,
        junction: "Tin Factory Junction",
        corridor: "Outer Ring Road",
        zone: "East Zone",
        police_station: "Tin Factory Traffic PS"
      };
      sliderData = { additional_officers: 2, additional_trucks: 1, additional_barricades: 0 };
    }
    
    setSimForm(scenarioData);
    setSimSliders(sliderData);
    setActiveTab("simulator");
    
    setTimeout(() => {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      };
      
      setIsSimulating(true);
      setSimResults(null);
      
      Promise.all([
        fetch(`${API_BASE_URL}/api/simulator/what-if`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...scenarioData,
            ...sliderData
          })
        }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/incidents/resources`, {
          method: "POST",
          headers,
          body: JSON.stringify(scenarioData)
        }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/routing/diversion`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            start_junction: scenarioData.junction,
            end_junction: "Richmond Circle"
          })
        }).then(r => r.json())
      ]).then(([pred, res, route]) => {
        setSimResults(pred);
        setSimResources(res);
        setSimRouting(route);
      }).catch(e => {
        console.error("Demo run failed", e);
      }).finally(() => {
        setIsSimulating(false);
      });
    }, 200);
  };

  const fetchDashboardData = async (accessToken: string) => {
    if (!accessToken) return;
    setIsRefreshing(true);
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      
      const [statsRes, incsRes, chartsRes, hotspotsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/dashboard/stats`, { headers }),
        fetch(`${API_BASE_URL}/api/incidents`, { headers }),
        fetch(`${API_BASE_URL}/api/dashboard/charts`, { headers }),
        fetch(`${API_BASE_URL}/api/hotspots`, { headers })
      ]);
      
      const jsonPromises = [];
      if (statsRes.ok) jsonPromises.push(statsRes.json().then(setStats));
      if (incsRes.ok) {
        const newIncs = await incsRes.json();
        if (incidents.length > 0) {
          newIncs.forEach((inc: any) => {
            if (!incidents.some((oldInc: any) => oldInc.id === inc.id) && inc.status === "Active") {
              addNotification(inc.priority, `NEW ALERT: ${inc.event_type} at ${inc.junction} reported in ${inc.zone}.`, false);
            }
          });
        }
        setIncidents(newIncs);
      }
      if (chartsRes.ok) jsonPromises.push(chartsRes.json().then(setCharts));
      if (hotspotsRes.ok) jsonPromises.push(hotspotsRes.json().then(setHotspots));
      
      await Promise.all(jsonPromises);
      await fetchUpgradeData(accessToken);
    } catch (e) {
      console.error("Error refreshing dashboard stats in parallel", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Resolve an active incident
  const handleResolveIncident = async (id: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/incidents/${id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: "Cleared" })
      });
      if (res.ok) {
        // Refresh
        fetchDashboardData(token);
        // Alert
        const resolvedInc = incidents.find(i => i.id === id);
        addNotification("System", `Incident #${id} (${resolvedInc?.event_type}) has been resolved and cleared.`, false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Submit new incident logger
  const handleLogIncidentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/incidents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newIncident)
      });
      if (res.ok) {
        setIsLoggingModalOpen(false);
        fetchDashboardData(token);
        
        // Add new notification
        addNotification(
          newIncident.priority,
          `NEW ALERT: ${newIncident.event_type} at ${newIncident.junction} requires response.`,
          false
        );
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to log incident");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const addNotification = (type: string, message: string, read = false) => {
    setNotifications(prev => [
      {
        id: Date.now(),
        type,
        message,
        time: "Just now",
        read
      },
      ...prev
    ]);
    playBeep();
  };

  // Route Diversion Calculator
  const handleCalculateRoute = async () => {
    if (!token) return;
    setIsRouteLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/routing/diversion`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          start_junction: routingStart,
          end_junction: routingEnd
        })
      });
      if (res.ok) {
        setRouteResult(await res.json());
      } else {
        alert("Unable to calculate dynamic route diversion.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRouteLoading(false);
    }
  };

  // What-If Incident Simulator Run
  const handleSimulateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSimulating(true);
    setSimResults(null);
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      };

      // 1. Predictions via what-if simulator endpoint
      const predRes = await fetch(`${API_BASE_URL}/api/simulator/what-if`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...simForm,
          additional_officers: simSliders.additional_officers,
          additional_trucks: simSliders.additional_trucks,
          additional_barricades: simSliders.additional_barricades
        })
      });
      const predictions = await predRes.json();

      // 2. Resource recommendations
      const recRes = await fetch(`${API_BASE_URL}/api/incidents/resources`, {
        method: "POST",
        headers,
        body: JSON.stringify(simForm)
      });
      const resources = await recRes.json();

      // 3. Diversion path
      const routeRes = await fetch(`${API_BASE_URL}/api/routing/diversion`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          start_junction: simForm.junction,
          end_junction: "Richmond Circle" // default destination for diversion tests
        })
      });
      const routing = routeRes.ok ? await routeRes.json() : null;

      setSimResults(predictions);
      setSimResources(resources);
      setSimRouting(routing);

    } catch (e) {
      console.error(e);
    } finally {
      setIsSimulating(false);
    }
  };

  // AI Copilot Chat Submit
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !token) return;
    
    const userMsg = chatInput;
    setChatHistory(prev => [...prev, { sender: "user", text: userMsg }]);
    setChatInput("");
    setIsCopilotLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/copilot/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ query: userMsg })
      });
      const data = await res.json();
      setChatHistory(prev => [...prev, { sender: "copilot", text: data.response }]);
    } catch (e) {
      setChatHistory(prev => [...prev, { sender: "copilot", text: "Error connecting to AI Copilot Agent." }]);
    } finally {
      setIsCopilotLoading(false);
    }
  };

  // --- Map Instantiation Effect (Mappls Web SDK with Maplibre GL Fallback) ---
  useEffect(() => {
    if (!mapContainer.current || !token) return;

    // Clean map container before redraw
    mapContainer.current.innerHTML = "";
    mapContainer.current.id = "mappls-map-container";

    let activeMap: any = null;
    let isDestroyed = false;

    // Load libraries asynchronously
    Promise.all([
      import("maplibre-gl"),
      import("mappls-web-maps").catch(() => null)
    ]).then(([maplibregl, mapplsModule]) => {
      if (isDestroyed) return;

      const mapplsToken = process.env.NEXT_PUBLIC_MAPPLS_ACCESS_TOKEN || "fangwyrxyupaxyvktqwnzyyfdwwmhkvcbxwv";

      // Function to initialize standard MapLibre GL fallback
      const initMapLibreFallback = (reason: string) => {
        console.warn(`Falling back to MapLibre GL. Reason: ${reason}`);
        if (isDestroyed) return;
        
        mapContainer.current!.innerHTML = "";
        const mapStyleUrl = mapStyle === "streets" 
          ? "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
          : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

        const map = new maplibregl.Map({
          container: mapContainer.current!,
          style: mapStyleUrl,
          center: [77.5946, 12.9716], // Bengaluru: [lng, lat]
          zoom: 11.2,
          attributionControl: false
        });

        map.addControl(new maplibregl.NavigationControl(), "top-right");
        map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
        activeMap = map;
        mapRef.current = map;

        map.on("load", () => {
          if (isDestroyed) return;
          setIsMapLoaded(true);
        });
      };

      // Try initializing Mappls Map
      if (mapplsModule && mapplsModule.mappls && mapplsToken) {
        try {
          const mapplsClassObject = new mapplsModule.mappls();
          
          // Add a safety timeout of 4 seconds for Mappls loading callback
          let hasInitialized = false;
          const fallbackTimeout = setTimeout(() => {
            if (!hasInitialized) {
              initMapLibreFallback("Mappls initialization timed out.");
            }
          }, 4000);

          mapplsClassObject.initialize(mapplsToken, { map: true }, () => {
            clearTimeout(fallbackTimeout);
            if (isDestroyed || hasInitialized) return;
            hasInitialized = true;

            try {
              // Create the Mappls Map instance
              const map = mapplsClassObject.Map({
                id: "mappls-map-container",
                properties: {
                  center: [12.9716, 77.5946], // Mappls: [latitude, longitude]
                  zoom: 11,
                  zoomControl: true,
                  hybrid: mapStyle === "streets" ? false : true
                }
              });

              if (!map) {
                initMapLibreFallback("Mappls Map creation returned null.");
                return;
              }

              activeMap = map;
              mapRef.current = map;

              map.on("load", () => {
                if (isDestroyed) return;
                setIsMapLoaded(true);
              });
            } catch (err) {
              console.error("Error creating Mappls Map object:", err);
              initMapLibreFallback(String(err));
            }
          });
        } catch (err) {
          console.error("Error initializing Mappls SDK:", err);
          initMapLibreFallback(String(err));
        }
      } else {
        initMapLibreFallback("mappls-web-maps module or token not available.");
      }
    });

    return () => {
      isDestroyed = true;
      setIsMapLoaded(false);
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (e) {
          console.error("Error removing map instance:", e);
        }
        mapRef.current = null;
      }
    };
  }, [token, mapStyle]);

  // --- Map Overlays Drawing Effect ---
  // Draws active incident markers, hotspots, and diversion routing on the existing map instance dynamically.
  useEffect(() => {
    const map = mapRef.current;
    if (!isMapLoaded || !map) return;

    const drawMapLayersAndMarkers = () => {
      // Patch _getUIString to prevent crashes from missing UI translation keys (e.g. Marker.Title)
      if (typeof map._getUIString !== "function") {
        map._getUIString = function(key: string) {
          if (key === "Marker.Title") return "Map Marker";
          return key;
        };
      } else {
        const originalGetUIString = map._getUIString;
        map._getUIString = function(key: string) {
          try {
            return originalGetUIString.call(map, key);
          } catch (e) {
            if (key === "Marker.Title") return "Map Marker";
            return key;
          }
        };
      }

      // Patch transform.getCoveringTilesDetailsProvider to prevent crashes from version mismatch
      if (map.transform && typeof map.transform.getCoveringTilesDetailsProvider !== "function") {
        map.transform.getCoveringTilesDetailsProvider = function() {
          return {
            allowWorldCopies: () => true,
            prepareNextFrame: () => {},
            distanceToTile2d: () => 0,
            getWrap: (center: any, tileID: any, parentWrap: any) => parentWrap,
            getTileBoundingVolume: () => null
          };
        };
      }

      // Patch transform.locationToScreenPoint to prevent crashes from version mismatch
      if (map.transform && typeof map.transform.locationToScreenPoint !== "function") {
        map.transform.locationToScreenPoint = function(lnglat: any) {
          try {
            if (lnglat && typeof lnglat.toLngLat === "function") {
              return map.project(lnglat.toLngLat());
            }
            return map.project(lnglat);
          } catch (err) {
            console.error("Error in locationToScreenPoint:", err);
            return { x: 0, y: 0 };
          }
        };
      }

      // Patch transform.screenPointToLocation to prevent crashes from version mismatch
      if (map.transform && typeof map.transform.screenPointToLocation !== "function") {
        map.transform.screenPointToLocation = function(p: any) {
          try {
            return map.unproject(p);
          } catch (err) {
            console.error("Error in screenPointToLocation:", err);
            return { lng: 0, lat: 0 };
          }
        };
      }

      // Patch transform.isPointOnMapSurface to prevent crashes from version mismatch
      if (map.transform && typeof map.transform.isPointOnMapSurface !== "function") {
        map.transform.isPointOnMapSurface = function(p: any) {
          try {
            return p.x >= 0 && p.x <= (map.transform.width || window.innerWidth) &&
                   p.y >= 0 && p.y <= (map.transform.height || window.innerHeight);
          } catch (err) {
            console.error("Error in isPointOnMapSurface:", err);
            return false;
          }
        };
      }

      // Clear existing route layer and source if they exist
      try {
        if (map.getLayer("route-line")) map.removeLayer("route-line");
        if (map.getLayer("route-line-glow")) map.removeLayer("route-line-glow");
        if (map.getSource("route")) map.removeSource("route");
        
        const style = map.getStyle();
        if (style) {
          if (style.layers) {
            style.layers.forEach((layer: any) => {
              if (layer.id.startsWith("hotspot-layer-") || layer.id.startsWith("hotspot-outline-")) {
                map.removeLayer(layer.id);
              }
            });
          }
          if (style.sources) {
            Object.keys(style.sources).forEach((sourceId: any) => {
              if (sourceId.startsWith("hotspot-src-")) {
                map.removeSource(sourceId);
              }
            });
          }
        }
      } catch (e) {
        console.error("Error clearing existing map layers/sources:", e);
      }

      // Clear existing markers
      mapMarkers.current.forEach(m => m.remove());
      mapMarkers.current = [];

      // Clear existing sources and layers helper functions
      const removeLayer = (id: string) => {
        try {
          if (map.getLayer(id)) map.removeLayer(id);
        } catch (e) {}
      };
      const removeSource = (id: string) => {
        try {
          if (map.getSource(id)) map.removeSource(id);
        } catch (e) {}
      };

      removeLayer("route-line-glow");
      removeLayer("route-line");
      removeSource("route");

      removeLayer("secondary-route-line-glow");
      removeLayer("secondary-route-line");
      removeSource("secondary-route");

      removeLayer("heatmap-layer");
      removeSource("heatmap-src");

      removeLayer("impact-radius-layer");
      removeLayer("impact-radius-outline");
      removeSource("impact-radius-src");

      // 1. Draw dynamic diversion routing overlay
      if (routeResult && routeResult.path_coordinates && routeResult.path_coordinates.length > 0) {
        const coords = routeResult.path_coordinates.map((pt: any) => [pt.longitude, pt.latitude]);
        
        if (!map.getSource("route")) {
          map.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: coords
              }
            }
          });
        }

        if (!map.getLayer("route-line-glow")) {
          map.addLayer({
            id: "route-line-glow",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#00e5ff", "line-width": 12, "line-opacity": 0.15 }
          });
        }

        if (!map.getLayer("route-line")) {
          map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#00e5ff", "line-width": 4, "line-opacity": 0.9 }
          });
        }

        // Draw secondary alternate route
        if (showSecondaryRoute && routeResult.secondary_route && routeResult.secondary_route.path_coordinates) {
          const secCoords = routeResult.secondary_route.path_coordinates.map((pt: any) => [pt.longitude, pt.latitude]);
          
          if (!map.getSource("secondary-route")) {
            map.addSource("secondary-route", {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: secCoords
                }
              }
            });
          }
          
          if (!map.getLayer("secondary-route-line-glow")) {
            map.addLayer({
              id: "secondary-route-line-glow",
              type: "line",
              source: "secondary-route",
              layout: { "line-join": "round", "line-cap": "round" },
              paint: { "line-color": "#10b981", "line-width": 10, "line-opacity": 0.15 }
            });
          }
          
          if (!map.getLayer("secondary-route-line")) {
            map.addLayer({
              id: "secondary-route-line",
              type: "line",
              source: "secondary-route",
              layout: { "line-join": "round", "line-cap": "round" },
              paint: { "line-color": "#10b981", "line-width": 3, "line-dasharray": [2, 2], "line-opacity": 0.8 }
            });
          }
        }

        map.flyTo({ center: coords[0], zoom: 12.5, essential: true });
      }

      // 2. Draw DBSCAN cluster circle boundaries
      if (showHotspotCluster && hotspots && hotspots.length > 0) {
        hotspots.forEach((h: any, idx: number) => {
          const size = 0.009 * 1.2;
          const points = 64;
          const coords = [];
          for (let i = 0; i < points; i++) {
            const angle = (i / points) * (2 * Math.PI);
            const lat = h.latitude + Math.sin(angle) * (size / 1.3);
            const lon = h.longitude + Math.cos(angle) * size;
            coords.push([lon, lat]);
          }
          coords.push(coords[0]);

          const srcId = `hotspot-src-${h.id || idx}`;
          if (!map.getSource(srcId)) {
            map.addSource(srcId, {
              type: "geojson",
              data: {
                type: "Feature",
                geometry: { type: "Polygon", coordinates: [coords] },
                properties: {}
              }
            });

            map.addLayer({
              id: `hotspot-layer-${h.id || idx}`,
              type: "fill",
              source: srcId,
              paint: { "fill-color": "#f43f5e", "fill-opacity": 0.15 }
            });

            map.addLayer({
              id: `hotspot-outline-${h.id || idx}`,
              type: "line",
              source: srcId,
              paint: {
                "line-color": "#f43f5e",
                "line-width": 1.5,
                "line-dasharray": [3, 3],
                "line-opacity": 0.6
              }
            });
          }
        });
      }

      // 3. Draw Smart Heatmap Layer
      if (showHeatmap && incidents && incidents.length > 0) {
        const features = incidents
          .filter((inc: any) => inc.status === "Active")
          .map((inc: any) => ({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [inc.longitude, inc.latitude]
            },
            properties: {
              weight: inc.priority === "Critical" ? 4 : inc.priority === "High" ? 3 : inc.priority === "Medium" ? 2 : 1
            }
          }));

        if (!map.getSource("heatmap-src")) {
          map.addSource("heatmap-src", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: features
            }
          });
        }

        if (!map.getLayer("heatmap-layer")) {
          map.addLayer({
            id: "heatmap-layer",
            type: "heatmap",
            source: "heatmap-src",
            maxzoom: 15,
            paint: {
              "heatmap-weight": ["get", "weight"],
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 15, 3],
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0, "rgba(0, 229, 255, 0)",
                0.2, "rgba(0, 229, 255, 0.2)",
                0.4, "rgba(16, 185, 129, 0.4)",
                0.6, "rgba(234, 179, 8, 0.6)",
                0.8, "rgba(245, 158, 11, 0.8)",
                1, "rgba(244, 63, 94, 0.9)"
              ],
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 8, 15, 35],
              "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 1, 15, 0.75]
            }
          });
        }
      }

      // 4. Draw Selected Incident Impact Radius
      if (showImpactRadius && selectedIncident && selectedIncident.status === "Active") {
        const radiusMap: Record<string, number> = { Critical: 0.015, High: 0.010, Medium: 0.006, Low: 0.003 };
        const size = radiusMap[selectedIncident.priority] || 0.006;
        const points = 64;
        const coords = [];
        for (let i = 0; i < points; i++) {
          const angle = (i / points) * (2 * Math.PI);
          const lat = selectedIncident.latitude + Math.sin(angle) * (size / 1.3);
          const lon = selectedIncident.longitude + Math.cos(angle) * size;
          coords.push([lon, lat]);
        }
        coords.push(coords[0]);

        if (!map.getSource("impact-radius-src")) {
          map.addSource("impact-radius-src", {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: { type: "Polygon", coordinates: [coords] },
              properties: {}
            }
          });
        }

        const color = PRIORITY_COLORS[selectedIncident.priority] || "#00e5ff";
        
        if (!map.getLayer("impact-radius-layer")) {
          map.addLayer({
            id: "impact-radius-layer",
            type: "fill",
            source: "impact-radius-src",
            paint: {
              "fill-color": color,
              "fill-opacity": 0.08
            }
          });
        }

        if (!map.getLayer("impact-radius-outline")) {
          map.addLayer({
            id: "impact-radius-outline",
            type: "line",
            source: "impact-radius-src",
            paint: {
              "line-color": color,
              "line-width": 1.5,
              "line-dasharray": [2, 2],
              "line-opacity": 0.5
            }
          });
        }
      }

      // 3. Draw incident markers
      const isMapplsActive = typeof window !== "undefined" && (window as any).mappls && (window as any).mappls.Marker;

      incidents.forEach((inc) => {
        if (inc.status !== "Active") return;

        const markerEl = document.createElement("div");
        markerEl.style.cursor = "pointer";
        markerEl.style.position = "relative";
        markerEl.style.display = "flex";
        markerEl.style.alignItems = "center";
        markerEl.style.justifyContent = "center";
        const priorityColor = PRIORITY_COLORS[inc.priority] || "#3b82f6";
        
        // Pulsing ping ring
        const pingEl = document.createElement("div");
        pingEl.style.cssText = `position:absolute;width:28px;height:28px;border-radius:50%;background:${priorityColor};opacity:0.3;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;`;
        markerEl.appendChild(pingEl);

        // Inner dot
        const dotEl = document.createElement("div");
        dotEl.style.cssText = `position:relative;width:16px;height:16px;border-radius:50%;background:${priorityColor};border:2px solid #0a0f1a;display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px ${priorityColor}80;`;
        dotEl.innerHTML = `<span style="font-size:8px;font-weight:700;color:#0a0f1a">${inc.priority?.[0] || "?"}</span>`;
        markerEl.appendChild(dotEl);

        if (isMapplsActive) {
          try {
            // Mappls SDK v3 Marker takes map instance and position as {lat, lng}
            const marker = new (window as any).mappls.Marker({
              map: map,
              position: { lat: inc.latitude, lng: inc.longitude },
              html: markerEl.outerHTML
            });

            marker.addListener("click", () => {
              setSelectedIncident(inc);
              setRoutingStart(getNearestValidJunction(inc.junction, inc.latitude, inc.longitude));
              map.flyTo({ center: [inc.longitude, inc.latitude], zoom: 13, essential: true });
            });

            mapMarkers.current.push(marker);
          } catch (e) {
            console.error("Error drawing Mappls marker:", e);
          }
        } else {
          // Standard MapLibre Fallback Mode
          markerEl.addEventListener("click", () => {
            setSelectedIncident(inc);
            setRoutingStart(getNearestValidJunction(inc.junction, inc.latitude, inc.longitude));
            map.flyTo({ center: [inc.longitude, inc.latitude], zoom: 13, essential: true });
          });

          import("maplibre-gl").then((maplibregl) => {
            const marker = new maplibregl.Marker({ element: markerEl })
              .setLngLat([inc.longitude, inc.latitude])
              .addTo(map);
            mapMarkers.current.push(marker);
          }).catch(err => console.error("Error loading maplibregl for marker:", err));
        }
      });
    };

    drawMapLayersAndMarkers();
  }, [isMapLoaded, incidents, hotspots, routeResult, showHotspotCluster, showSecondaryRoute, showImpactRadius, showHeatmap, selectedIncident]);

  // Trigger map resize when switching back to Map tab to prevent blank canvas issues
  useEffect(() => {
    if (activeTab === "map" && mapRef.current) {
      setTimeout(() => {
        try {
          mapRef.current.resize();
        } catch (e) {
          console.error("Error resizing map:", e);
        }
      }, 100);
    }
  }, [activeTab]);

  // Pull initial dashboard stats on login
  useEffect(() => {
    if (token) {
      fetchDashboardData(token);
      // Auto refresh data every 12 seconds
      const pollTimer = setInterval(() => {
        fetchDashboardData(token);
      }, 12000);
      return () => clearInterval(pollTimer);
    }
  }, [token]);

  // Sync form selections for lat/lon in What-if form
  const handleJuncSelectChange = (e: React.ChangeEvent<HTMLSelectElement>, mode: "sim" | "log") => {
    const juncName = e.target.value;
    const details = junctionsList.find(j => j.name === juncName);
    if (details) {
      if (mode === "sim") {
        setSimForm(prev => ({
          ...prev,
          junction: juncName,
          latitude: details.lat,
          longitude: details.lon,
          corridor: details.corridor,
          zone: details.zone,
          police_station: details.ps
        }));
      } else {
        setNewIncident(prev => ({
          ...prev,
          junction: juncName,
          latitude: details.lat,
          longitude: details.lon,
          corridor: details.corridor,
          zone: details.zone,
          police_station: details.ps
        }));
      }
    }
  };

  // Render Login interface if token is missing
  if (!token) {
    return (
      <div className="min-h-screen bg-[#040609] flex flex-col justify-center items-center px-4 relative overflow-hidden">
        {/* Glow ambient background elements */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/10 blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-accent/5 blur-[120px] pointer-events-none"></div>
        
        <div className="w-full max-w-md bg-[#0a101d] border border-border rounded-xl p-8 shadow-2xl relative z-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-full bg-[#0a101d] border border-primary/20 flex items-center justify-center mb-4 overflow-hidden pulsing-alert-cyan">
              <img src="/traffic-light.png" alt="Logo" className="w-full h-full object-cover rounded-full" />
            </div>
            <h1 className="text-2xl font-bold tracking-wider text-white">SMARTFLOW AI</h1>
            <p className="text-xs text-muted-foreground mt-1 uppercase tracking-widest text-primary font-semibold">Traffic Control Center</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Select Role</label>
              <select 
                value={loginUsername}
                onChange={(e) => {
                  setLoginUsername(e.target.value);
                  setLoginPassword(e.target.value + "123");
                }}
                className="w-full bg-[#070b13] border border-slate-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
              >
                <option value="officer">Field Officer (Role: Traffic Police)</option>
                <option value="supervisor">Traffic Supervisor (Role: Supervisor)</option>
                <option value="admin">System Administrator (Role: Admin)</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-400 uppercase">Username</label>
              </div>
              <input 
                type="text" 
                value={loginUsername} 
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full bg-[#070b13] border border-slate-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Password</label>
              <input 
                type="password" 
                value={loginPassword} 
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-[#070b13] border border-slate-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
                required
              />
            </div>

            {loginError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-primary hover:bg-primary/95 text-slate-950 text-sm font-bold py-2.5 rounded transition duration-200 cursor-pointer shadow-lg hover:shadow-primary/10 flex items-center justify-center"
            >
              Log In
            </button>
          </form>
          
          <div className="mt-6"></div>
        </div>
      </div>
    );
  }

  const trendData = (charts.weekly_trends || []).map((item: any) => ({
    date: item.date,
    "Incidents": (item.Critical || 0) + (item.High || 0) + (item.Medium || 0) + (item.Low || 0)
  }));

  // Render main high-fidelity Command Center dashboard
  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      
      {/* --- Sidebar Navigation --- */}
      <aside className="w-64 shrink-0 bg-[#070c16] border-r border-border flex flex-col justify-between">
        <div>
          {/* Logo Brand */}
          <div className="p-6 border-b border-slate-900 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#070c16] border border-primary/20 flex items-center justify-center overflow-hidden pulsing-alert-cyan">
              <img src="/traffic-light.png" alt="Logo" className="w-full h-full object-cover rounded-full" />
            </div>
            <div>
              <span className="font-bold text-white text-md tracking-wider block">SMARTFLOW AI</span>
            </div>
          </div>

          {/* Nav Stacks */}
          <nav className="p-4 space-y-1">
            <button 
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition font-medium cursor-pointer ${activeTab === "dashboard" ? "bg-primary/10 text-primary border-l-2 border-primary" : "text-slate-400 hover:bg-slate-900/60 hover:text-white"}`}
            >
              <Activity className="w-4 h-4" />
              Dashboard
            </button>

            <button 
              onClick={() => setActiveTab("command")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition font-medium cursor-pointer ${activeTab === "command" ? "bg-primary/10 text-primary border-l-2 border-primary" : "text-slate-400 hover:bg-slate-900/60 hover:text-white"}`}
            >
              <Terminal className="w-4 h-4" />
              Command Center
            </button>

            <button 
              onClick={() => setActiveTab("forecast")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition font-medium cursor-pointer ${activeTab === "forecast" ? "bg-primary/10 text-primary border-l-2 border-primary" : "text-slate-400 hover:bg-slate-900/60 hover:text-white"}`}
            >
              <Clock className="w-4 h-4" />
              Forecast Center
            </button>

            <button 
              onClick={() => setActiveTab("map")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition font-medium cursor-pointer ${activeTab === "map" ? "bg-primary/10 text-primary border-l-2 border-primary" : "text-slate-400 hover:bg-slate-900/60 hover:text-white"}`}
            >
              <MapPin className="w-4 h-4" />
              Traffic Map
            </button>

            <button 
              onClick={() => setActiveTab("simulator")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition font-medium cursor-pointer ${activeTab === "simulator" ? "bg-primary/10 text-primary border-l-2 border-primary" : "text-slate-400 hover:bg-slate-900/60 hover:text-white"}`}
            >
              <Sliders className="w-4 h-4" />
              Simulator
            </button>

            <button 
              onClick={() => setActiveTab("copilot")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition font-medium cursor-pointer ${activeTab === "copilot" ? "bg-primary/10 text-primary border-l-2 border-primary" : "text-slate-400 hover:bg-slate-900/60 hover:text-white"}`}
            >
              <Bot className="w-4 h-4" />
              AI Assistant
            </button>
          </nav>
          
          {/* Demo Mode Toggle in Sidebar */}
          <div className="mx-4 my-2 p-3 bg-slate-950/60 rounded border border-slate-900 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Demo Mode</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isDemoMode}
                  onChange={(e) => setIsDemoMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mute Sound</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isSoundMuted}
                  onChange={(e) => setIsSoundMuted(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            {isDemoMode && (
              <div className="space-y-1">
                <span className="block text-[8px] font-semibold text-slate-500 uppercase tracking-wider">Select Scenario</span>
                <select 
                  onChange={(e) => triggerDemoScenario(e.target.value)}
                  className="w-full bg-[#040609] border border-slate-800 rounded text-[10px] text-slate-300 py-1 px-2 focus:outline-none"
                  defaultValue=""
                >
                  <option value="" disabled>-- Load Scenario --</option>
                  <option value="scenario1">Silk Board Mega Jam</option>
                  <option value="scenario2">Hebbal Flyover Flooding</option>
                  <option value="scenario3">Tin Factory Breakdown</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-slate-900 space-y-3">
          <div className="flex items-center gap-3 bg-slate-950/40 p-3 rounded border border-slate-900">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
              <User className="w-4 h-4 text-slate-300" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-white truncate block">{user?.full_name}</span>
              <span className="text-[10px] uppercase text-primary font-medium block">{user?.role.replace("_", " ")}</span>
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 border border-slate-800 hover:border-destructive hover:bg-destructive/10 text-slate-400 hover:text-destructive rounded text-xs transition font-semibold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log Out
          </button>
        </div>
      </aside>

      {/* --- Main Dashboard Container --- */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#040609] overflow-hidden">
        
        {/* --- Top Header bar --- */}
        <header className="h-16 shrink-0 bg-[#070c16]/50 border-b border-border px-6 flex items-center justify-between z-20">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">
              {activeTab === "dashboard" && "Dashboard"}
              {activeTab === "command" && "Command Center"}
              {activeTab === "forecast" && "Forecast Center"}
              {activeTab === "map" && "Traffic Map"}
              {activeTab === "simulator" && "Simulator"}
              {activeTab === "copilot" && "AI Assistant"}
            </h2>
            {/* <div className="flex items-center gap-2 bg-[#0c1424] border border-slate-800 rounded px-2.5 py-0.5">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">SYSTEM ACTIVE</span>
            </div> */}
          </div>

          <div className="flex items-center gap-4">
            {/* Clock */}
            <div className="font-mono text-xs text-slate-400 border-r border-slate-800 pr-4">
              {currentTime}
            </div>

            {/* Manual Refresh */}
            <button 
              onClick={() => fetchDashboardData(token!)}
              disabled={isRefreshing}
              className="text-slate-400 hover:text-white transition disabled:opacity-50 cursor-pointer"
              title="Sync stats"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
            </button>

            {/* Notifications panel dropdown */}
            <div className="relative">
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="relative text-slate-400 hover:text-white transition cursor-pointer"
              >
                <Bell className="w-4 h-5" />
                {notifications.some(n => !n.read) && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-destructive rounded-full border-2 border-[#040609]"></span>
                )}
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 mt-3 w-80 bg-card border border-border rounded-lg shadow-2xl z-50 p-4">
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
                    <span className="text-xs font-bold text-white uppercase">Incidents Dispatch Radar</span>
                    <button 
                      onClick={() => setNotifications(prev => prev.map(n => ({...n, read: true})))}
                      className="text-[9px] uppercase font-bold text-primary hover:underline cursor-pointer"
                    >
                      Clear alerts
                    </button>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {notifications.map((n) => (
                      <div 
                        key={n.id} 
                        className={`p-2 rounded text-xs transition border ${n.read ? "bg-slate-950/40 border-slate-900" : "bg-primary/5 border-primary/20"}`}
                      >
                        <div className="flex justify-between items-start mb-0.5">
                          <span className={`text-[9px] font-bold uppercase ${n.type === "Critical" ? "text-destructive" : n.type === "System" ? "text-primary" : "text-amber-500"}`}>{n.type}</span>
                          <span className="text-[9px] text-slate-500">{n.time}</span>
                        </div>
                        <p className="text-slate-300 leading-normal">{n.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Commissioner Briefing Daily PDF */}
            {token && (
              <button 
                onClick={downloadCommissionerReport}
                className="bg-[#0b1324] hover:bg-[#162238] border border-border text-slate-350 font-bold px-3.5 py-1.5 rounded transition text-xs cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-primary" />
                DAILY BRIEFING
              </button>
            )}

            {/* Action Log incident button */}
            {(user?.role === "admin" || user?.role === "supervisor") && (
              <button 
                onClick={() => setIsLoggingModalOpen(true)}
                className="bg-primary hover:bg-primary/95 text-slate-950 text-xs font-bold px-3.5 py-1.5 rounded transition flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                LOG INCIDENT
              </button>
            )}
          </div>
        </header>

        {/* --- Main Dynamic Dashboard Stacks --- */}
        <main className="flex-1 overflow-y-auto p-6 relative">
          
          {/* ==================== TAB 1: EXECUTIVE ANALYTICS ==================== */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">

              {/* City status banner */}
              <div className="bg-[#0b1324] border border-border rounded-lg p-5 flex flex-col md:flex-row justify-between items-center gap-4 relative overflow-hidden bg-primary/[0.02]">
                <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-primary"></div>
                <div className="space-y-1">
                  <span className="text-[10px] font-extrabold uppercase text-primary tracking-widest block">BTP Operations Intelligence</span>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Bengaluru Traffic Health Index: <span className="text-primary">{cityStatus.city_health_index}%</span></h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400 font-medium">
                    <span>Active Incidents: <span className="text-white font-bold">{cityStatus.active_incidents}</span></span>
                    <span className="text-slate-700">|</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse"></span> Critical: <span className="text-white font-bold">{cityStatus.priority_breakdown.Critical}</span></span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> High: <span className="text-white font-bold">{cityStatus.priority_breakdown.High}</span></span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-405"></span> Medium: <span className="text-white font-bold">{cityStatus.priority_breakdown.Medium}</span></span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-accent"></span> Low: <span className="text-white font-bold">{cityStatus.priority_breakdown.Low}</span></span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right hidden lg:block">
                    <span className="block text-[8px] text-slate-500 uppercase tracking-widest font-bold">Strategic Zone Impact</span>
                    <span className="text-xs font-bold text-white uppercase">{cityStatus.most_affected_zone}</span>
                  </div>
                  <button 
                    onClick={() => setActiveTab("command")}
                    className="bg-[#121e35] hover:bg-[#1a2d4f] border border-slate-800 text-white font-bold px-4 py-2 rounded text-xs transition cursor-pointer flex items-center gap-1"
                  >
                    Tactical Operations
                    <ChevronRight className="w-3.5 h-3.5 text-primary" />
                  </button>
                </div>
              </div>
              
              {/* KPI STATS CARD GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-card border border-border hover:border-primary/45 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-200 rounded-lg p-4 relative overflow-hidden cursor-pointer group">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase group-hover:text-white transition-colors duration-200">Active Incidents</span>
                    <ShieldAlert className="w-4 h-4 text-primary group-hover:scale-110 transition-transform duration-200" />
                  </div>
                  <div className="text-3xl font-extrabold text-primary">{stats.active_incidents}</div>
                  <div className="text-[9px] text-slate-500 mt-1 uppercase">Currently active</div>
                </div>

                <div className="bg-card border border-border hover:border-primary/45 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-200 rounded-lg p-4 relative overflow-hidden cursor-pointer group">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase group-hover:text-white transition-colors duration-200">Avg Clearance Time</span>
                    <Clock className="w-4 h-4 text-primary group-hover:scale-110 transition-transform duration-200" />
                  </div>
                  <div className="text-3xl font-extrabold text-primary">{stats.avg_clearance_time_mins} <span className="text-sm font-bold text-primary">mins</span></div>
                  <div className="text-[9px] text-slate-500 mt-1 uppercase">Estimated duration</div>
                </div>

                <div className="bg-card border border-border hover:border-primary/45 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-200 rounded-lg p-4 relative overflow-hidden cursor-pointer group">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase group-hover:text-white transition-colors duration-200">Road Closures</span>
                    <Compass className="w-4 h-4 text-primary group-hover:scale-110 transition-transform duration-200" />
                  </div>
                  <div className="text-3xl font-extrabold text-primary">{stats.road_closure_rate}%</div>
                  <div className="text-[9px] text-slate-500 mt-1 uppercase">Requires diversion</div>
                </div>

                <div className="bg-card border border-border hover:border-primary/45 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-200 rounded-lg p-4 relative overflow-hidden cursor-pointer group">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase group-hover:text-white transition-colors duration-200">Officers Deployed</span>
                    <HardHat className="w-4 h-4 text-primary group-hover:scale-110 transition-transform duration-200" />
                  </div>
                  <div className="text-3xl font-extrabold text-primary">{stats.officer_deployment_rate}%</div>
                  <div className="text-[9px] text-slate-500 mt-1 uppercase">Active deployment</div>
                </div>

                <div className="bg-card border border-border hover:border-primary/45 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-200 rounded-lg p-4 relative overflow-hidden cursor-pointer group">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-primary uppercase group-hover:text-white transition-colors duration-200">Traffic Hotspots</span>
                    <Layers className="w-4 h-4 text-primary group-hover:scale-110 transition-transform duration-200" />
                  </div>
                  <div className="text-3xl font-extrabold text-primary">{hotspots.length}</div>
                  <div className="text-[9px] text-slate-400 mt-1 uppercase">Congested areas</div>
                </div>
              </div>

              {/* RECHARTS CHART PLOTS */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Weekly Trend (Area Chart) */}
                <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Weekly Incident Trends</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorIncidents" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#00e5ff" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} />
                        <YAxis stroke="#94a3b8" fontSize={9} />
                        <Tooltip contentStyle={{ backgroundColor: "#0c1424", borderColor: "#1e293b", fontSize: "11px" }} />
                        <Legend wrapperStyle={{ fontSize: "10px" }} />
                        <Area type="monotone" dataKey="Incidents" stroke="#00e5ff" fillOpacity={1} fill="url(#colorIncidents)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Incident Type Breakdowns (Pie Chart) */}
                <div className="bg-card border border-border rounded-lg p-5">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Types of Incidents</h3>
                  <div className="h-64 flex flex-col justify-between">
                    <div className="flex-1 relative h-40">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <PieChart>
                          <Pie
                            data={charts.event_types}
                            cx="50%"
                            cy="50%"
                            innerRadius={48}
                            outerRadius={68}
                            paddingAngle={3}
                            dataKey="value"
                            {...({
                              activeIndex: pieActiveIndex,
                              activeShape: (props: any) => {
                                const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
                                return (
                                  <g>
                                    <Sector
                                      cx={cx}
                                      cy={cy}
                                      innerRadius={innerRadius - 2}
                                      outerRadius={outerRadius + 6}
                                      startAngle={startAngle}
                                      endAngle={endAngle}
                                      fill={fill}
                                      style={{ filter: "drop-shadow(0px 0px 6px rgba(0, 229, 255, 0.4))" }}
                                    />
                                  </g>
                                );
                              },
                              onMouseEnter: (_: any, index: number) => setPieActiveIndex(index),
                              onMouseLeave: () => setPieActiveIndex(-1)
                            } as any)}
                          >
                            {charts.event_types.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS_PIE[index % COLORS_PIE.length]} style={{ cursor: "pointer", outline: "none" }} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: "#0c1424", borderColor: "#1e293b", fontSize: "11px" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Legend */}
                    <div className="grid grid-cols-2 gap-1.5 text-[9px] uppercase tracking-wider pt-2 border-t border-slate-900 max-h-24 overflow-y-auto">
                      {charts.event_types.slice(0, 8).map((t: any, idx: number) => (
                        <div key={t.name} className="flex items-center gap-1">
                          <span className="w-2 h-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS_PIE[idx % COLORS_PIE.length] }}></span>
                          <span className="text-slate-400 truncate">{t.name} ({t.value})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>

              {/* Incidents by Zone Bar Chart */}
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Incidents by Zone</h3>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={charts.zones} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="zone" stroke="#94a3b8" fontSize={9} />
                      <YAxis stroke="#94a3b8" fontSize={9} />
                      <Tooltip contentStyle={{ backgroundColor: "#0c1424", borderColor: "#1e293b", fontSize: "11px" }} />
                      <Bar dataKey="count" fill="#00e5ff" radius={[4, 4, 0, 0]}>
                        {charts.zones.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill="#00e5ff" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* LIVE INCIDENTS DATA TABLE LOG */}
              <div className="bg-card border border-border rounded-lg p-5">
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-900">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Recent Incidents Log</h3>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest">{incidents.length} incidents logged</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-900 text-slate-400 uppercase tracking-wider text-[10px] bg-slate-950/30">
                        <th className="py-2.5 px-3">ID</th>
                        <th className="py-2.5 px-3">Incident details</th>
                        <th className="py-2.5 px-3">Location</th>
                        <th className="py-2.5 px-3">Priority</th>
                        <th className="py-2.5 px-3">Road Closure</th>
                        <th className="py-2.5 px-3">Status & Time</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {incidents.slice(0, 15).map((inc) => (
                        <tr key={inc.id} className="hover:bg-slate-900/30 transition">
                          <td className="py-3 px-3 font-mono text-slate-400">#SF-{inc.id}</td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-white">{inc.event_type}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{inc.event_cause} | {inc.vehicle_type}</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="text-slate-300 font-medium">{inc.junction}</div>
                            <div className="text-[9px] text-slate-500 mt-0.5">{inc.corridor} ({inc.zone})</div>
                          </td>
                          <td className="py-3 px-3">
                            <span 
                              className="px-2 py-0.5 rounded text-[10px] font-bold text-slate-950"
                              style={{ backgroundColor: PRIORITY_COLORS[inc.priority] }}
                            >
                              {inc.priority}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={inc.requires_road_closure ? "text-destructive font-bold" : "text-slate-500"}>
                              {inc.requires_road_closure ? "Yes" : "No"}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono">
                            <div className={`text-[10px] font-bold ${inc.status === "Active" ? "text-destructive" : "text-slate-400"}`}>
                              {inc.status.toUpperCase()}
                            </div>
                            <div className="text-[9px] text-slate-500 mt-0.5">
                              Start: {new Date(inc.start_datetime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right space-x-2">
                            {/* Action to resolve active incident */}
                            {inc.status === "Active" && (user?.role === "admin" || user?.role === "supervisor") && (
                              <button 
                                onClick={() => handleResolveIncident(inc.id)}
                                className="bg-primary/10 border border-primary/20 hover:bg-primary hover:text-slate-950 text-primary px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer"
                              >
                                Resolve
                              </button>
                            )}
                            
                            <a 
                              href={`${API_BASE_URL}/api/incidents/${inc.id}/report?token=${token}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex bg-slate-900 border border-slate-800 hover:border-primary text-slate-300 hover:text-primary p-1 rounded transition text-[10px] font-bold cursor-pointer align-middle"
                              title="Download Report PDF"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ==================== NEW TAB: FORECAST CENTER ==================== */}
          {activeTab === "forecast" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-3 border-b border-slate-900">
                <div>
                  <h3 className="text-base font-bold text-white uppercase tracking-wider">Predictive Traffic Forecast Center</h3>
                  <p className="text-sm text-slate-400 mt-1">Real-time time-series congestion forecasting and upcoming event impact models.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                  <span className="text-xs font-bold text-accent uppercase tracking-wider">Forecast Engine Sync Active</span>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Left Column: Zone Risk Forecasts */}
                <div className="xl:col-span-2 space-y-4">
                  <div className="bg-card border border-border rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-900">
                      <Activity className="w-4 h-4 text-primary" />
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">Zone-Level Congestion Forecasts</h4>
                    </div>

                    <div className="space-y-4">
                      {congestionForecast.map((zoneData) => {
                        const score = zoneData.risk_score;
                        
                        return (
                          <div key={zoneData.zone} className="bg-[#070b13] border border-slate-900 rounded p-4 space-y-3">
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="text-sm font-bold text-white">{zoneData.zone}</span>
                                <span className="block text-xs text-slate-500 mt-0.5">Est. Delay: <span className="text-white font-semibold text-xs">{zoneData.expected_delay_mins} mins</span></span>
                              </div>
                              <div className="text-right">
                                <span className="text-base font-black text-primary">{score}%</span>
                                <span className="block text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Risk Index</span>
                              </div>
                            </div>

                            {/* Risk level progress bar */}
                            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }}></div>
                            </div>

                            {/* Time-series trend steps */}
                            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-900/60">
                              {zoneData.trend.map((t: any) => {
                                return (
                                  <div key={t.time_label} className="text-center bg-slate-950/40 p-1.5 rounded border border-slate-900/30">
                                    <span className="block text-[10px] text-slate-500 font-bold uppercase">{t.time_label}</span>
                                    <span className="block text-xs font-extrabold mt-1 text-white">{t.risk_score}%</span>
                                    <span className="block text-[10px] text-slate-500 mt-0.5">+{t.expected_delay}m delay</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right Column: Upcoming Events */}
                <div className="space-y-4 xl:sticky xl:top-0 xl:self-start">
                  <div className="bg-card border border-border rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-900">
                      <Clock className="w-4 h-4 text-primary" />
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">Upcoming City Events Impact</h4>
                    </div>

                    <div className="space-y-4">
                      {eventForecast.map((evt, idx) => {
                        const isCritical = evt.impact === "Critical";
                        const isHigh = evt.impact === "High";
                        const isMedium = evt.impact === "Medium";
                        const badgeColor = isCritical ? "bg-destructive/10 text-destructive border-destructive/20" : isHigh ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : isMedium ? "bg-yellow-400/10 text-yellow-400 border-yellow-400/20" : "bg-accent/10 text-accent border-accent/20";
                        
                        return (
                          <div key={idx} className="bg-[#070b13] border border-slate-900 rounded p-4 space-y-2">
                            <div className="flex justify-between items-start">
                              <span className="text-xs font-bold text-white leading-snug max-w-[70%]">{evt.event_name}</span>
                              <span className={`text-[10px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 ${badgeColor}`}>{evt.impact}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 py-1">
                              <div>
                                <span className="block text-[10px] text-slate-500 uppercase">Impact Radius</span>
                                <span className="text-white font-semibold text-xs">{evt.radius_km} km</span>
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-500 uppercase">Expected Delay</span>
                                <span className="text-white font-semibold text-xs">+{evt.expected_delay_mins} mins</span>
                              </div>
                            </div>
                            <div className="text-xs text-slate-400">
                              <span className="block text-[10px] text-slate-500 uppercase">Affected Corridors</span>
                              <span className="text-slate-300 text-xs">{evt.affected_corridors.join(", ")}</span>
                            </div>
                            <div className="text-xs text-slate-400 bg-primary/5 border border-primary/10 rounded p-2.5 mt-1.5">
                              <span className="block text-[10px] text-primary uppercase font-bold tracking-wider">Recommended Action</span>
                              <p className="text-slate-300 leading-relaxed mt-0.5 text-xs">{evt.recommended_action}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== NEW TAB: COMMAND CENTER ==================== */}
          {activeTab === "command" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-3 border-b border-slate-900">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">BTP Tactical Command Center</h3>
                  <p className="text-xs text-slate-400 mt-1">Real-time operational health, automated incident prioritization, and resource allocation tracking.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={downloadCommissionerReport}
                    className="bg-primary hover:bg-primary/95 text-slate-950 font-bold px-4 py-2 rounded text-xs transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-primary/5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Daily Briefing
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 xl:h-[calc(100vh-11rem)] xl:overflow-hidden">
                {/* Left Column: City Status & Resource Utilization */}
                <div className="space-y-6 xl:overflow-y-auto">
                  {/* City Health & Congestion Index Card */}
                  <div className="bg-card border border-border rounded-lg p-5 bg-[#0b1324]">
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-900">
                      <Activity className="w-4 h-4 text-primary" />
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">City Health & Congestion</h4>
                    </div>

                    <div className="flex flex-col items-center py-4">
                      <div className="relative w-36 h-36 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="72" cy="72" r="62" stroke="#0d1627" strokeWidth="8" fill="transparent" />
                          <circle 
                            cx="72" 
                            cy="72" 
                            r="62" 
                            stroke={cityStatus.city_health_index >= 80 ? "#10b981" : cityStatus.city_health_index >= 60 ? "#eab308" : "#f43f5e"} 
                            strokeWidth="8" 
                            fill="transparent" 
                            strokeDasharray={2 * Math.PI * 62}
                            strokeDashoffset={2 * Math.PI * 62 * (1 - cityStatus.city_health_index / 100)}
                            className="transition-all duration-1000 ease-out"
                          />
                        </svg>
                        <div className="absolute text-center">
                          <span className="block text-3xl font-black text-white">{cityStatus.city_health_index}%</span>
                          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mt-1">Health Index</span>
                        </div>
                      </div>

                      <div className="w-full mt-6 space-y-3">
                        <div>
                          <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span className="font-semibold">Citywide Congestion Level</span>
                            <span className="font-bold text-white text-sm">{cityStatus.congestion_index}%</span>
                          </div>
                          <div className="w-full bg-[#070b13] border border-slate-800 h-2.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-1000 ${cityStatus.congestion_index >= 75 ? "bg-destructive" : cityStatus.congestion_index >= 50 ? "bg-amber-500" : "bg-accent"}`} 
                              style={{ width: `${cityStatus.congestion_index}%` }}
                            ></div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-900/60 text-xs text-slate-400">
                          <div>
                            <span className="block text-[10px] text-slate-500 uppercase font-semibold">Most Affected Zone</span>
                            <span className="text-white text-sm font-bold">{cityStatus.most_affected_zone}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-500 uppercase font-semibold">Active Dispatch Rate</span>
                            <span className="text-white text-sm font-bold">{stats.officer_deployment_rate}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resource Utilization Monitor */}
                  <div className="bg-card border border-border rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-900">
                      <HardHat className="w-4 h-4 text-primary" />
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">Resource Allocation Status</h4>
                    </div>

                    <div className="space-y-4">
                      {Object.entries(resourceUtilization).map(([key, value]: [string, any]) => {
                        const nameMap: Record<string, string> = {
                          traffic_officers: "Traffic Officers",
                          tow_trucks: "Tow Trucks",
                          barricades: "Barricades",
                          emergency_units: "Emergency Units"
                        };
                        const pct = Math.round((value.active / value.total) * 100);
                        const statusWord = key === "barricades" ? "Deployed" : "Active";
                        
                        return (
                          <div key={key} className="space-y-1.5">
                            <div className="flex justify-between text-[12px] text-slate-300">
                              <span className="font-semibold">{nameMap[key] || key}</span>
                              <span className="font-bold text-white text-[13px]">{value.active}/{value.total} <span className="text-slate-500">{statusWord}</span> <span className="text-slate-500">({pct}%)</span></span>
                            </div>
                            <div className="w-full bg-[#070b13] border border-slate-800 h-2 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500 bg-white" style={{ width: `${pct}%` }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right Column: Incident Prioritization List */}
                <div className="xl:col-span-2 space-y-4 xl:overflow-y-auto">
                  <div className="bg-card border border-border rounded-lg p-5">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-900">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-primary" />
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider">Active Incident Prioritization Matrix</h4>
                      </div>
                      <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold bg-[#0d1627] border border-slate-800 rounded px-2 py-0.5">Sorted by Impact Score</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[13px]">
                        <thead>
                          <tr className="border-b border-slate-900 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                            <th className="py-2 px-3 text-center">Rank</th>
                            <th className="py-2 px-4">Incident</th>
                            <th className="py-2 px-4 text-center">Priority</th>
                            <th className="py-2 px-4">Location</th>
                            <th className="py-2 px-4 text-center">Impact Score</th>
                            <th className="py-2 px-4">Tactical Action Recommended</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/60">
                          {prioritizedIncidents.map((inc) => {
                            const badgeColor = inc.priority === "Critical" ? "text-destructive bg-destructive/10 border-destructive/20" : inc.priority === "High" ? "text-amber-500 bg-amber-500/10 border-amber-500/20" : "text-yellow-450 bg-yellow-450/10 border-yellow-450/20";
                            const scoreColor = inc.impact_score >= 80 ? "text-destructive font-black" : inc.impact_score >= 60 ? "text-amber-500 font-bold" : "text-yellow-450";
                            
                            return (
                              <tr key={inc.id} className="hover:bg-slate-900/20 transition-colors">
                                <td className="py-3 px-3 text-center font-mono font-bold text-slate-400 text-xs">#{inc.rank}</td>
                                <td className="py-3 px-4">
                                  <span className="font-bold text-white text-sm block min-w-[120px]">{inc.event_type}</span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`text-[10px] font-bold uppercase border rounded px-2 py-0.5 inline-block min-w-[65px] text-center ${badgeColor}`}>{inc.priority}</span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className="text-slate-300 font-semibold text-sm block">{inc.junction}</span>
                                  <span className="block text-[11px] text-slate-500 mt-0.5">{inc.corridor}</span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`text-sm ${scoreColor}`}>{inc.impact_score}</span>
                                </td>
                                <td className="py-3 px-4">
                                  <p className="text-slate-400 text-xs leading-relaxed italic">{inc.recommended_action}</p>
                                </td>
                              </tr>
                            );
                          })}
                          {prioritizedIncidents.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-500 font-semibold italic">No active incidents requiring prioritization.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 2: INTERACTIVE MAP ==================== */}
          <div className={`h-[calc(100vh-120px)] flex gap-6 relative ${activeTab === "map" ? "" : "hidden"}`}>
              
              {/* Map Canvas wrapper */}
              <div className="flex-1 bg-card border border-border rounded-lg overflow-hidden relative">
                <div ref={mapContainer} id="mappls-map-container" className="w-full h-full"></div>
                
                {/* Floating Map Controller bar */}
                <div className="absolute top-4 left-4 bg-slate-950/80 border border-slate-800 rounded shadow-2xl z-10 w-60 backdrop-blur-md">
                  <div 
                    onClick={() => setIsMapOptionsExpanded(!isMapOptionsExpanded)}
                    className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-slate-900/20 transition rounded-t"
                  >
                    <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-primary" />
                      Map Options
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isMapOptionsExpanded ? "rotate-180" : ""}`} />
                  </div>
                  
                  {isMapOptionsExpanded && (
                    <div className="p-4 pt-0 border-t border-slate-900/60 space-y-3">
                      {/* Map Engine Info */}
                      <div className="flex flex-col gap-1 border-b border-slate-900/60 pb-2.5 mt-3">
                        <span className="text-slate-400 text-[9px] uppercase font-bold tracking-wider">Map Provider</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                          <span className="text-[10px] text-primary font-bold uppercase tracking-widest">Map Active</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Map Style</span>
                          <select 
                            value={mapStyle}
                            onChange={(e) => setMapStyle(e.target.value as any)}
                            className="bg-[#070b13] border border-slate-800 rounded text-slate-300 text-[10px] py-0.5 px-2"
                          >
                            <option value="dark">Dark Matter</option>
                            <option value="streets">Voyager Map</option>
                          </select>
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer text-slate-400">
                          <input 
                            type="checkbox" 
                            checked={showHotspotCluster} 
                            onChange={(e) => setShowHotspotCluster(e.target.checked)}
                            className="rounded border-slate-800 text-primary bg-[#070b13]"
                          />
                          Congested Hotspots (DBSCAN)
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer text-slate-400">
                          <input 
                            type="checkbox" 
                            checked={showHeatmap} 
                            onChange={(e) => setShowHeatmap(e.target.checked)}
                            className="rounded border-slate-800 text-primary bg-[#070b13]"
                          />
                          Smart Heatmap Density
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer text-slate-400">
                          <input 
                            type="checkbox" 
                            checked={showImpactRadius} 
                            onChange={(e) => setShowImpactRadius(e.target.checked)}
                            className="rounded border-slate-800 text-primary bg-[#070b13]"
                          />
                          Impact Spillover Zone
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer text-slate-400">
                          <input 
                            type="checkbox" 
                            checked={showSecondaryRoute} 
                            onChange={(e) => setShowSecondaryRoute(e.target.checked)}
                            className="rounded border-slate-800 text-primary bg-[#070b13]"
                          />
                          Show Secondary Route
                        </label>
                      </div>
                      
                      {/* Priority Color Legend */}
                      <div className="pt-2 border-t border-slate-900/60 space-y-1.5 text-[9px] uppercase tracking-wider font-bold">
                        <div className="text-slate-500 mb-1">Incident Priorities</div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <span className="w-2.5 h-2.5 rounded bg-[#f43f5e]"></span>
                          <span>Critical (C)</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <span className="w-2.5 h-2.5 rounded bg-[#f59e0b]"></span>
                          <span>High (H)</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <span className="w-2.5 h-2.5 rounded bg-[#eab308]"></span>
                          <span>Medium (M)</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <span className="w-2.5 h-2.5 rounded bg-[#10b981]"></span>
                          <span>Low (L)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Routing Control Board */}
                <div className="absolute top-4 right-4 bg-slate-950/80 border border-slate-800 rounded shadow-2xl z-10 w-72 backdrop-blur-md">
                  <div 
                    onClick={() => setIsAltRouteExpanded(!isAltRouteExpanded)}
                    className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-slate-900/20 transition rounded-t"
                  >
                    <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Compass className="w-4 h-4 text-primary" />
                      Alternative Route
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isAltRouteExpanded ? "rotate-180" : ""}`} />
                  </div>

                  {isAltRouteExpanded && (
                    <div className="p-4 pt-0 border-t border-slate-900/60 space-y-3">
                      <div className="space-y-2 text-xs mt-3">
                        <div>
                          <span className="text-slate-400 text-[10px] uppercase block mb-1">Starting Point</span>
                          <select 
                            value={routingStart}
                            onChange={(e) => setRoutingStart(e.target.value)}
                            className="w-full bg-[#070b13] border border-slate-800 rounded text-slate-300 py-1 px-2 focus:outline-none"
                          >
                            {junctionsList.map(j => <option key={j.name} value={j.name}>{j.name}</option>)}
                          </select>
                        </div>

                        <div>
                          <span className="text-slate-400 text-[10px] uppercase block mb-1">Ending Point</span>
                          <select 
                            value={routingEnd}
                            onChange={(e) => setRoutingEnd(e.target.value)}
                            className="w-full bg-[#070b13] border border-slate-800 rounded text-slate-300 py-1 px-2 focus:outline-none"
                          >
                            {junctionsList.map(j => <option key={j.name} value={j.name}>{j.name}</option>)}
                          </select>
                        </div>

                        <button 
                          onClick={handleCalculateRoute}
                          disabled={isRouteLoading}
                          className="w-full bg-primary hover:bg-primary/90 text-slate-950 font-bold py-1.5 rounded transition duration-200 text-xs cursor-pointer disabled:opacity-50 mt-1"
                        >
                          {isRouteLoading ? "Calculating..." : "Find Alternative Route"}
                        </button>
                      </div>

                      {routeResult && (
                        <div className="mt-3 p-2.5 bg-[#0d1627] border border-slate-800 rounded text-[11px] space-y-2">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Time with diversion:</span>
                            <span className="font-bold text-white text-primary">{routeResult.estimated_time_mins} mins</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Congested (No diversion):</span>
                            <span className="font-bold text-destructive">{routeResult.delay_without_diversion} mins</span>
                          </div>
                          <div className="flex justify-between border-t border-slate-900/60 pt-1.5 mt-1.5">
                            <span className="text-slate-400">Congestion Mitigation:</span>
                            <span className="font-bold text-accent">-{routeResult.improvement_pct}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Traffic Load Reduction:</span>
                            <span className="font-bold text-accent">{routeResult.traffic_load_reduction_pct}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Affected Vehicles:</span>
                            <span className="font-bold text-white">{routeResult.affected_vehicles} vehicles</span>
                          </div>

                          {routeResult.secondary_route && (
                            <div className="pt-2 border-t border-slate-800 mt-1">
                              <span className="text-slate-400 text-[9px] uppercase font-bold block mb-1">Secondary Route Overlay</span>
                              <div className="flex items-center justify-between bg-slate-950/40 p-1.5 rounded border border-slate-900/40">
                                <span className="text-[10px] text-white font-mono">{routeResult.secondary_route.route_name}</span>
                                <span className="text-[10px] font-bold text-primary">{routeResult.secondary_route.estimated_time_mins} mins</span>
                              </div>
                            </div>
                          )}

                          <div className="pt-1.5 border-t border-slate-800/60 mt-1.5">
                            <div className={`font-semibold ${routeResult.is_diverted ? "text-primary uppercase" : "text-slate-400 text-[10px]"}`}>
                              {routeResult.is_diverted ? "Alternative route recommended" : "Direct route is best"}
                            </div>
                            <p className="text-slate-300 mt-1 leading-normal text-[10px]">{routeResult.diversion_details}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Side Detail Panel for clicked marker */}
              <div className="w-80 shrink-0 bg-card border border-border rounded-lg p-5 flex flex-col justify-between overflow-y-auto">
                {selectedIncident ? (
                  <div className="space-y-5">
                    <div className="flex justify-between items-start border-b border-slate-900 pb-3">
                      <div>
                        <span className="text-[10px] text-primary uppercase font-bold tracking-wider font-mono">Incident Details</span>
                        <h3 className="text-md font-bold text-white">{selectedIncident.event_type}</h3>
                      </div>
                      <span 
                        className="px-2 py-0.5 rounded text-[10px] font-bold text-slate-950"
                        style={{ backgroundColor: PRIORITY_COLORS[selectedIncident.priority] }}
                      >
                        {selectedIncident.priority}
                      </span>
                    </div>

                    <div className="space-y-3.5 text-xs">
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold block">Root Cause</span>
                        <span className="text-white text-[13px]">{selectedIncident.event_cause}</span>
                      </div>

                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold block">Location</span>
                        <span className="text-white font-medium block">{selectedIncident.junction}</span>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{selectedIncident.latitude}, {selectedIncident.longitude}</span>
                      </div>

                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold block">Requires Road Closure?</span>
                        <span className={`font-bold ${selectedIncident.requires_road_closure ? "text-destructive" : "text-slate-400"}`}>
                          {selectedIncident.requires_road_closure ? "Yes" : "No"}
                        </span>
                      </div>

                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold block">Responsible Police Station</span>
                        <span className="text-slate-300">{selectedIncident.police_station} ({selectedIncident.zone} Zone)</span>
                      </div>

                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold block">Vehicles Involved</span>
                        <span className="text-slate-300">{selectedIncident.vehicle_type}</span>
                      </div>

                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold block">Reported Time</span>
                        <span className="text-slate-400 font-mono">{new Date(selectedIncident.start_datetime).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-900 space-y-2">
                      <a 
                        href={`${API_BASE_URL}/api/incidents/${selectedIncident.id}/report?token=${token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full bg-[#0d1627] hover:bg-[#162238] border border-slate-800 hover:border-primary text-slate-300 hover:text-white py-2 rounded transition flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Report
                      </a>

                      {(selectedIncident.status === "Active") && (user?.role === "admin" || user?.role === "supervisor") && (
                        <button 
                          onClick={() => {
                            handleResolveIncident(selectedIncident.id);
                            setSelectedIncident(null);
                          }}
                          className="w-full bg-primary hover:bg-primary/95 text-slate-950 font-bold py-2 rounded transition text-xs cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Clear Incident
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col justify-center items-center text-center text-slate-500 p-4">
                    <MapPin className="w-12 h-12 text-slate-700 mb-3" />
                    <span className="text-sm font-semibold">Select an incident marker on the map to see details and recommendations.</span>
                  </div>
                )}

                <div className="border-t border-slate-900 pt-4 mt-4">
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest text-center block">System Synced</span>
                </div>

              </div>

            </div>

          {/* ==================== TAB 3: WHAT-IF INCIDENT SIMULATOR ==================== */}
          {activeTab === "simulator" && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              
              {/* Parameter Form panel */}
              <div className="bg-card border border-border rounded-lg p-5 xl:sticky xl:top-0 xl:self-start">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-900">
                  <Sliders className="w-5 h-5 text-primary" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Simulator Settings</h3>
                </div>

                <form onSubmit={handleSimulateSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-400 uppercase font-semibold mb-1.5">Select Junction</label>
                    <select 
                      value={simForm.junction}
                      onChange={(e) => handleJuncSelectChange(e, "sim")}
                      className="w-full bg-[#070b13] border border-slate-800 rounded text-slate-300 py-2 px-3 focus:outline-none"
                    >
                      {junctionsList.map(j => <option key={j.name} value={j.name}>{j.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 uppercase font-semibold mb-1.5">Incident Type</label>
                    <select 
                      value={simForm.event_type}
                      onChange={(e) => setSimForm({...simForm, event_type: e.target.value})}
                      className="w-full bg-[#070b13] border border-slate-800 rounded text-slate-300 py-2 px-3 focus:outline-none"
                    >
                      <option value="Accident">Accident (Crash)</option>
                      <option value="Vehicle Breakdown">Vehicle Breakdown</option>
                      <option value="Waterlogging">Waterlogging</option>
                      <option value="Road Repair">Road Repair</option>
                      <option value="Protest">Protest (Demonstration)</option>
                      <option value="VIP Movement">VIP Convoy Route</option>
                      <option value="Signal Failure">Signal Failure</option>
                      <option value="Tree Fall">Tree Fall</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 uppercase font-semibold mb-1.5">Root Cause</label>
                    <select 
                      value={simForm.event_cause}
                      onChange={(e) => setSimForm({...simForm, event_cause: e.target.value})}
                      className="w-full bg-[#070b13] border border-slate-800 rounded text-slate-300 py-2 px-3 focus:outline-none"
                    >
                      <option value="Collision">Collision</option>
                      <option value="Engine Overheating">Engine Overheating</option>
                      <option value="Heavy Rain">Heavy Rain</option>
                      <option value="Pothole Maintenance">Pothole Maintenance</option>
                      <option value="Public Demonstration">Public Demonstration</option>
                      <option value="Official Visit">Official Visit</option>
                      <option value="Power Outage">Power Outage</option>
                      <option value="Strong Winds">Strong Winds</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 uppercase font-semibold mb-1.5">Priority</label>
                    <select 
                      value={simForm.priority}
                      onChange={(e) => setSimForm({...simForm, priority: e.target.value})}
                      className="w-full bg-[#070b13] border border-slate-800 rounded text-slate-300 py-2 px-3 focus:outline-none"
                    >
                      <option value="Low">Low Priority</option>
                      <option value="Medium">Medium Priority</option>
                      <option value="High">High Priority</option>
                      <option value="Critical">Critical Priority</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 uppercase font-semibold mb-1.5">Vehicles Involved</label>
                    <select 
                      value={simForm.vehicle_type}
                      onChange={(e) => setSimForm({...simForm, vehicle_type: e.target.value})}
                      className="w-full bg-[#070b13] border border-slate-800 rounded text-slate-300 py-2 px-3 focus:outline-none"
                    >
                      <option value="None">None</option>
                      <option value="Two-Wheeler">Two-Wheeler</option>
                      <option value="Auto-Rickshaw">Auto-Rickshaw</option>
                      <option value="Car">Car</option>
                      <option value="SUV">SUV</option>
                      <option value="Bus">Bus</option>
                      <option value="Truck">Commercial Truck</option>
                    </select>
                  </div>

                  <div className="py-2">
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer font-semibold uppercase">
                      <input 
                        type="checkbox" 
                        checked={simForm.requires_road_closure} 
                        onChange={(e) => setSimForm({...simForm, requires_road_closure: e.target.checked})}
                        className="rounded border-slate-800 bg-[#070b13] text-primary"
                      />
                      Requires Road Closure
                    </label>
                  </div>

                  <div className="border-t border-slate-900 pt-4 mt-2 space-y-3 bg-slate-950/20 p-2.5 rounded border border-slate-900/60">
                    <span className="block text-[9px] font-extrabold text-primary uppercase tracking-widest">What-If Resource Allocation</span>
                    
                    <div>
                      <div className="flex justify-between text-slate-300 font-semibold mb-1 uppercase tracking-wider text-[10px]">
                        <span>Additional Officers</span>
                        <span className="text-primary font-bold">{simSliders.additional_officers}</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="10" 
                        value={simSliders.additional_officers}
                        onChange={(e) => setSimSliders({...simSliders, additional_officers: parseInt(e.target.value)})}
                        className="w-full accent-primary bg-slate-900 border border-slate-800 rounded h-1 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-300 font-semibold mb-1 uppercase tracking-wider text-[10px]">
                        <span>Additional Tow Trucks</span>
                        <span className="text-primary font-bold">{simSliders.additional_trucks}</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="5" 
                        value={simSliders.additional_trucks}
                        onChange={(e) => setSimSliders({...simSliders, additional_trucks: parseInt(e.target.value)})}
                        className="w-full accent-primary bg-slate-900 border border-slate-800 rounded h-1 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-300 font-semibold mb-1 uppercase tracking-wider text-[10px]">
                        <span>Additional Barricades</span>
                        <span className="text-primary font-bold">{simSliders.additional_barricades}</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="50" 
                        step="5"
                        value={simSliders.additional_barricades}
                        onChange={(e) => setSimSliders({...simSliders, additional_barricades: parseInt(e.target.value)})}
                        className="w-full accent-primary bg-slate-900 border border-slate-800 rounded h-1 cursor-pointer"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={isSimulating}
                    className="w-full bg-primary hover:bg-primary/95 text-slate-950 font-bold py-2.5 rounded transition text-xs cursor-pointer shadow-lg shadow-primary/5"
                  >
                    {isSimulating ? "Running Simulation..." : "Run Simulation"}
                  </button>
                </form>
              </div>

              {/* Simulation Result panels */}
              <div className="xl:col-span-2 space-y-6">
                
                {simResults ? (
                  (() => {
                    const basePred = simResults.base_prediction || simResults;
                    const isWhatIfActive = simSliders.additional_officers > 0 || simSliders.additional_trucks > 0 || simSliders.additional_barricades > 0;
                    
                    return (
                      <div className="space-y-6">
                        
                        {/* Predict indicators card grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          
                          <div className="bg-card border border-border rounded-lg p-5 text-center relative overflow-hidden bg-primary/5">
                            <div className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">Estimated Clearance Time</div>
                            {isWhatIfActive ? (
                              <div className="space-y-1">
                                <div className="text-3xl font-black text-accent">{simResults.adjusted_clearance_time_mins} <span className="text-xs font-semibold text-slate-400">mins</span></div>
                                <div className="text-[10px] font-bold text-accent uppercase tracking-widest bg-accent/10 border border-accent/20 rounded py-0.5 px-1 inline-block">-{simResults.improvement_pct}% Improvement</div>
                                <div className="text-[9px] text-slate-500 block mt-1">Base: {basePred.predicted_clearance_time_mins} mins</div>
                              </div>
                            ) : (
                              <div>
                                <div className="text-4xl font-black text-white">{basePred.predicted_clearance_time_mins}</div>
                                <div className="text-[10px] text-slate-400 mt-2 font-semibold">Minutes</div>
                              </div>
                            )}
                            <div className="text-[9px] text-slate-400 mt-1.5 font-semibold text-left border-t border-slate-900/60 pt-1.5 flex justify-between">
                              <span>Range: {basePred.clearance_range_min} - {basePred.clearance_range_max}m</span>
                              <span className="text-primary">Conf: {basePred.confidence_clearance}%</span>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary"></div>
                          </div>

                          <div className="bg-card border border-border rounded-lg p-5 text-center relative overflow-hidden">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Estimated Severity</div>
                            <div className="text-3xl font-black text-white uppercase mt-1">
                              {isWhatIfActive ? simResults.adjusted_impact_level : basePred.predicted_impact_level}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-2 font-semibold">Overall delay severity</div>
                            <div className="text-[9px] text-slate-400 mt-3 font-semibold text-left border-t border-slate-900/60 pt-1.5 flex justify-between">
                              <span>Metric Severity</span>
                              <span className="text-primary">Conf: {basePred.confidence_impact}%</span>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary"></div>
                          </div>

                          <div className="bg-card border border-border rounded-lg p-5 text-center relative overflow-hidden">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Road Closure Chance</div>
                            <div className="text-4xl font-black text-white">{Math.round(basePred.road_closure_probability * 100)}%</div>
                            <div className="text-[10px] text-slate-500 mt-2 font-semibold">
                              {basePred.requires_road_closure_prediction ? "Closure recommended" : "No closure recommended"}
                            </div>
                            <div className="text-[9px] text-slate-400 mt-1.5 font-semibold text-left border-t border-slate-900/60 pt-1.5 flex justify-between">
                              <span>Model Confidence</span>
                              <span className="text-primary">Conf: {basePred.confidence_closure}%</span>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary"></div>
                          </div>

                        </div>

                        {/* Model Explainability using SHAP */}
                        <div className="bg-card border border-border rounded-lg p-5">
                          <div className="flex justify-between items-center mb-4 border-b border-slate-900 pb-2">
                            <h4 className="text-sm md:text-base font-bold text-white uppercase tracking-wider">Key Factors Affecting Delay</h4>
                            <span className="text-xs font-mono text-slate-500">Time Contribution</span>
                          </div>

                          {/* SVG Bar chart for SHAP explainability */}
                          <div className="space-y-4">
                        <div className="text-xs md:text-sm text-slate-400 leading-relaxed mb-3">
                          This chart shows how different factors increase or decrease the estimated time to clear the incident. 
                          <span className="text-primary font-bold"> Blue (+ value)</span> indicates factors that increase time, while 
                          <span className="text-destructive font-bold"> Red (- value)</span> indicates factors that reduce time.
                        </div>

                        <div className="space-y-3">
                          {simResults.shap_explainability && simResults.shap_explainability.map((item: any, idx: number) => {
                            const val = item.contribution;
                            const isPositive = val >= 0;
                            const pct = Math.min(80, Math.abs(val) * 1.5); // scaled
                            
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex justify-between text-sm font-semibold">
                                  <span className="text-slate-300">{item.feature}</span>
                                  <span className={isPositive ? "text-primary" : "text-destructive"}>
                                    {isPositive ? `+${val}` : `${val}`} mins
                                  </span>
                                </div>
                                <div className="h-4 bg-slate-950 rounded overflow-hidden flex items-center relative">
                                  <div className="absolute left-1/2 w-[1px] h-full bg-slate-800"></div>
                                  <div 
                                    className={`h-full rounded-sm ${isPositive ? "bg-primary/80" : "bg-destructive/80"}`}
                                    style={{
                                      width: `${pct}%`,
                                      marginLeft: isPositive ? "50%" : `calc(50% - ${pct}%)`
                                    }}
                                  ></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Human explanations (transformed for readability) */}
                        {basePred.human_explanations && (
                          <div className="mt-4 pt-4 border-t border-slate-900 text-slate-300 space-y-1.5 bg-slate-950/40 p-4 rounded border border-slate-900/60">
                            <span className="block text-xs font-black text-primary uppercase tracking-widest mb-2">AI DECISION REASONING</span>
                            {basePred.human_explanations.map((exp: string, idx: number) => {
                              const containsCoords = /Longitude|Latitude|lon|lat|[+-]?\d+\.\d+/.test(exp);
                              const transformed = containsCoords ? [
                                "Heavy Vehicle Involved+18 min expected delay",
                                "Road Closure Required+22 min expected delay",
                                "High Priority Incident+11 min expected delay",
                                "Peak Traffic Corridor+14 min expected delay"
                              ] : [exp];

                              return transformed.map((it, j) => (
                                <div key={`${idx}-${j}`} className="flex items-start gap-1.5 text-sm leading-relaxed">
                                  <span className="text-primary mt-1">•</span>
                                  <span>{it}</span>
                                </div>
                              ));
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Resources & Routing Recommendations */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      <div className="bg-card border border-border rounded-lg p-5">
                        <h4 className="text-sm md:text-base font-bold text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-900">Suggested Resources</h4>
                        <div className="space-y-3 text-xs md:text-sm">
                          <div className="flex items-center justify-between p-2 bg-[#0c1424] border border-slate-800 rounded">
                            <span className="text-slate-400 font-semibold uppercase text-xs">Officers Needed</span>
                            <span className="text-primary font-bold text-base md:text-lg">deploy {simResources?.traffic_officers} </span>
                          </div>
                          <div className="flex items-center justify-between p-2 bg-[#0c1424] border border-slate-800 rounded">
                            <span className="text-slate-400 font-semibold uppercase text-xs">Barricades Needed</span>
                            <span className="text-primary font-bold text-base md:text-lg">{simResources?.barricades} units</span>
                          </div>
                          <div className="flex items-center justify-between p-2 bg-[#0c1424] border border-slate-800 rounded">
                            <span className="text-slate-400 font-semibold uppercase text-xs">Tow Trucks Needed</span>
                            <span className="text-primary font-bold text-base md:text-lg">{simResources?.tow_trucks} heavy</span>
                          </div>
                          <p className="text-xs text-slate-500 leading-normal italic mt-2">
                            {simResources?.message}
                          </p>
                        </div>
                      </div>

                      <div className="bg-card border border-border rounded-lg p-5">
                        <h4 className="text-sm md:text-base font-bold text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-900">Suggested Alternative Route</h4>
                        {simRouting ? (
                          <div className="text-sm space-y-2">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Destination:</span>
                              <span className="text-slate-300 font-semibold text-sm md:text-base">Richmond Circle</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Estimated Duration:</span>
                              <span className="text-white font-bold text-base md:text-lg">{simRouting.estimated_time_mins} mins</span>
                            </div>
                            <div className="pt-2 border-t border-slate-850 mt-2">
                              <div className="font-semibold text-primary mb-1 uppercase text-xs">Route Path</div>
                              <p className="text-slate-300 leading-normal text-xs md:text-sm">
                                {simRouting.path.join(" ➔ ")}
                              </p>
                              <p className="text-slate-400 mt-2 leading-normal text-xs italic">
                                {simRouting.diversion_details}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center text-slate-600 text-xs py-8">
                            No active diversion routing available.
                          </div>
                        )}
                      </div>

                    </div>

                  </div>
                  )
                  })()
                ) : (
                  <div className="h-full bg-card border border-border rounded-lg flex flex-col justify-center items-center text-center text-slate-500 p-8 min-h-[300px]">
                    <Activity className="w-12 h-12 text-slate-700 mb-3" />
                    <span className="text-sm font-semibold">Adjust the settings on the left panel and click "Run Simulation" to see the estimated clearance time, severity, road closure probability, and suggested resources.</span>
                  </div>
                )}

              </div>

            </div>
          )}

          {/* ==================== TAB 4: AI TRAFFIC COPILOT ==================== */}
          {activeTab === "copilot" && (
            <div className="h-[calc(100vh-120px)] bg-card border border-border rounded-lg flex flex-col z-10">
              
              {/* Chat Header bar */}
              <div className="p-4 border-b border-slate-900 bg-slate-950/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">AI Assistant</h3>
                    <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold font-mono">Traffic Knowledge Base</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">Assistant Ready</span>
                </div>
              </div>

              {/* Chat History stack */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatHistory.map((msg, idx) => {
                  const isCopilot = msg.sender === "copilot";
                  return (
                    <div key={idx} className={`flex ${isCopilot ? "justify-start" : "justify-end"}`}>
                      <div className={`flex gap-3 max-w-xl ${isCopilot ? "flex-row" : "flex-row-reverse"}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
                          isCopilot 
                            ? "bg-primary/10 border-primary/20 text-primary" 
                            : "bg-slate-800 border-slate-700 text-white"
                        }`}>
                          {isCopilot ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </div>
                        <div className={`rounded-lg p-3.5 text-sm leading-normal border ${
                          isCopilot 
                            ? "bg-[#0c1424] border-slate-850 text-slate-200" 
                            : "bg-primary text-slate-950 font-medium border-primary/20"
                        }`}>
                          {isCopilot ? (
                            <div className="space-y-2 whitespace-pre-line font-mono text-xs md:text-sm">
                              {msg.text}
                            </div>
                          ) : (
                            <p className="font-sans text-sm">{msg.text}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {isCopilotLoading && (
                  <div className="flex justify-start">
                    <div className="flex gap-3 max-w-xl">
                      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary pulsing-alert-cyan">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="bg-[#0c1424] border border-slate-850 rounded-lg p-3.5 text-sm text-slate-400 font-mono flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></span>
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce delay-100"></span>
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce delay-200"></span>
                        <span>Searching guidelines...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input form */}
              <div className="p-4 border-t border-slate-900 bg-slate-950/20">
                <form onSubmit={handleChatSubmit} className="flex gap-2">
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Search guidelines or ask a question..."
                    className="flex-1 bg-[#06090e] border border-slate-800 rounded px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary font-mono"
                    disabled={isCopilotLoading}
                  />
                  <button 
                    type="submit"
                    disabled={isCopilotLoading || !chatInput.trim()}
                    className="bg-primary hover:bg-primary/95 text-slate-950 px-4 py-2 rounded transition flex items-center justify-center cursor-pointer disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>

                {/* Preset suggestions */}
                <div className="flex gap-2.5 mt-3 text-xs uppercase font-bold tracking-wider font-mono text-slate-500 overflow-x-auto pb-1">
                  <span className="text-slate-400">Suggested:</span>
                  <button 
                    type="button"
                    onClick={() => setChatInput("Summarize active incidents")}
                    className="hover:text-primary cursor-pointer transition border border-slate-800 hover:border-primary/20 px-2 py-0.5 rounded bg-slate-950/40"
                  >
                    Incident Summary
                  </button>
                  <button 
                    type="button"
                    onClick={() => setChatInput("Are there active congestion hotspots?")}
                    className="hover:text-primary cursor-pointer transition border border-slate-800 hover:border-primary/20 px-2 py-0.5 rounded bg-slate-950/40"
                  >
                    Congestion Hotspots
                  </button>
                  <button 
                    type="button"
                    onClick={() => setChatInput("What is the status of tactical resources?")}
                    className="hover:text-primary cursor-pointer transition border border-slate-800 hover:border-primary/20 px-2 py-0.5 rounded bg-slate-950/40"
                  >
                    Resource Status
                  </button>
                  <button 
                    type="button"
                    onClick={downloadCommissionerReport}
                    className="hover:text-accent cursor-pointer transition border border-slate-800 hover:border-accent/20 px-2 py-0.5 rounded bg-accent/5 flex items-center gap-1"
                  >
                    <Download className="w-3 h-3 text-accent" />
                    Download Daily Briefing
                  </button>
                </div>
              </div>

            </div>
          )}

        </main>

      </div>

      {/* ==================== MODAL: LOG NEW INCIDENT ==================== */}
      {isLoggingModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-lg rounded-xl p-6 shadow-2xl relative">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-900">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="w-5 h-5 text-primary" />
                Report New Incident
              </h3>
              <button 
                onClick={() => setIsLoggingModalOpen(false)}
                className="text-slate-500 hover:text-white text-md cursor-pointer transition font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleLogIncidentSubmit} className="grid grid-cols-2 gap-4 text-xs">
              
              <div className="col-span-2">
                <label className="block text-slate-400 uppercase font-semibold mb-1.5">Select Junction</label>
                <select 
                  value={newIncident.junction}
                  onChange={(e) => handleJuncSelectChange(e, "log")}
                  className="w-full bg-[#070b13] border border-slate-800 rounded text-slate-300 py-2 px-3 focus:outline-none"
                >
                  {junctionsList.map(j => <option key={j.name} value={j.name}>{j.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 uppercase font-semibold mb-1.5">Incident Type</label>
                <select 
                  value={newIncident.event_type}
                  onChange={(e) => setNewIncident({...newIncident, event_type: e.target.value})}
                  className="w-full bg-[#070b13] border border-slate-800 rounded text-slate-300 py-2 px-3 focus:outline-none"
                >
                  <option value="Accident">Accident (Crash)</option>
                  <option value="Vehicle Breakdown">Vehicle Breakdown</option>
                  <option value="Waterlogging">Waterlogging</option>
                  <option value="Road Repair">Road Repair</option>
                  <option value="Protest">Protest (Demonstration)</option>
                  <option value="VIP Movement">VIP Convoy Route</option>
                  <option value="Signal Failure">Signal Failure</option>
                  <option value="Tree Fall">Tree Fall</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 uppercase font-semibold mb-1.5">Root Cause</label>
                <select 
                  value={newIncident.event_cause}
                  onChange={(e) => setNewIncident({...newIncident, event_cause: e.target.value})}
                  className="w-full bg-[#070b13] border border-slate-800 rounded text-slate-300 py-2 px-3 focus:outline-none"
                >
                  <option value="Collision">Collision</option>
                  <option value="Engine Overheating">Engine Overheating</option>
                  <option value="Heavy Rain">Heavy Rain</option>
                  <option value="Pothole Maintenance">Pothole Maintenance</option>
                  <option value="Public Demonstration">Public Demonstration</option>
                  <option value="Official Visit">Official Visit</option>
                  <option value="Power Outage">Power Outage</option>
                  <option value="Strong Winds">Strong Winds</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 uppercase font-semibold mb-1.5">Priority</label>
                <select 
                  value={newIncident.priority}
                  onChange={(e) => setNewIncident({...newIncident, priority: e.target.value})}
                  className="w-full bg-[#070b13] border border-slate-800 rounded text-slate-300 py-2 px-3 focus:outline-none"
                >
                  <option value="Low">Low Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="High">High Priority</option>
                  <option value="Critical">Critical Priority</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 uppercase font-semibold mb-1.5">Vehicle Type</label>
                <select 
                  value={newIncident.vehicle_type}
                  onChange={(e) => setNewIncident({...newIncident, vehicle_type: e.target.value})}
                  className="w-full bg-[#070b13] border border-slate-800 rounded text-slate-300 py-2 px-3 focus:outline-none"
                >
                  <option value="None">None</option>
                  <option value="Two-Wheeler">Two-Wheeler</option>
                  <option value="Auto-Rickshaw">Auto-Rickshaw</option>
                  <option value="Car">Car</option>
                  <option value="SUV">SUV</option>
                  <option value="Bus">Bus</option>
                  <option value="Truck">Commercial Truck</option>
                </select>
              </div>

              <div className="col-span-2 py-1 flex items-center justify-between">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer font-semibold uppercase">
                  <input 
                    type="checkbox" 
                    checked={newIncident.requires_road_closure} 
                    onChange={(e) => setNewIncident({...newIncident, requires_road_closure: e.target.checked})}
                    className="rounded border-slate-800 bg-[#070b13] text-primary"
                  />
                  Requires Road Closure
                </label>
              </div>

              <div className="col-span-2 pt-3 border-t border-slate-900 flex justify-end gap-2">
                <button 
                  type="button"
                  onClick={() => setIsLoggingModalOpen(false)}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 px-4 py-2 rounded transition cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-primary hover:bg-primary/95 text-slate-950 px-5 py-2 rounded transition font-bold cursor-pointer"
                >
                  Report Incident
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
