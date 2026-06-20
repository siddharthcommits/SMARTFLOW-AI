# SMARTFLOW AI — Bengaluru Traffic Command & Control Platform 🚦

An intelligent, high-fidelity traffic incident forecasting, monitoring, and resource optimization platform designed for the **Bengaluru Traffic Police (BTP) Command Center**. 

Powered by machine learning models trained on real traffic dynamics, the platform enables real-time decision-making, automated officer dispatch, congestion risk forecasting, and conversational AI assistance.

---

## 🚀 Live Demo & Quick Start
* **Live Web App**: `https://[your-vercel-project-name].vercel.app` *(Insert your Vercel URL here)*
* **Backend API**: `https://smartflow-ai-production.up.railway.app`

### 🔑 Demo Credentials (Frictionless Login)
Use the **Select Role** dropdown on the login page to instantly auto-fill credentials for these roles:
* 🛠️ **System Administrator**: `admin` / `admin123` (Full configuration access)
* 👮 **Traffic Area Supervisor**: `supervisor` / `supervisor123` (Control center panel & approvals)
* 📣 **Field Officer**: `officer` / `officer123` (Dashboard view & basic actions)

---

## 🌟 Key Features
* 🖥️ **Command Center Panel**: Monitor active incidents on an interactive Bengaluru map. Incidents are automatically ranked by a custom computed **AI Impact Score** to help dispatchers prioritize high-impact blockages.
* 🔮 **Forecast Center**: View 4-hour time-series congestion risk forecasts across all major Bengaluru traffic zones (South, East, Central, Whitefield, etc.).
* 📅 **Event Impact Monitor**: Predicts the radius and time delay impact of scheduled upcoming events (protests, political rallies, VIP convoys, cricket matches).
* 📈 **AI Dispatcher & Recommender**: Recommends the exact type and number of resources (officers, tow trucks, barricades, emergency units) needed to clear an incident based on similar historical events.
* 💬 **Gemini AI Copilot**: A conversational assistant integrated directly into the dashboard. Ask the copilot for status updates, route diversions, or general traffic management reasoning.
* 📄 **Executive PDF Briefing**: Generate and download daily executive briefing reports designed for the **Traffic Commissioner** at a single click.

---

## 🛠️ Technology Stack
### Frontend
* **Core**: Next.js (App Router, TypeScript)
* **Styling**: Tailwind CSS (Vanilla CSS for maximum control)
* **Visuals**: Recharts (High-fidelity traffic trend lines and pie charts)
* **Maps**: Maplibre GL

### Backend
* **API Framework**: FastAPI (Python)
* **Database**: PostgreSQL (Neon Serverless Postgres) with SQLAlchemy ORM
* **LLM Engine**: Google Gemini API (`gemini-2.0-flash` with fallback structure)

### Machine Learning Stack
* **XGBoost Regressor**: Predicts exact incident clearance time.
* **CatBoost Classifier**: Classifies traffic impact severity (Low, Medium, High).
* **Random Forest Classifier**: Predicts if an incident will require road closures.
* **SHAP (SHapley Additive exPlanations)**: Calculates the exact feature contributions for every single prediction, providing transparent "plain English" AI reasoning to operators.

---

## 📁 Project Structure
```
smartflow-ai/
├── backend/
│   ├── main.py                 # FastAPI application & ML inference endpoints
│   ├── database.py             # Database schemas & seeding logic
│   ├── auth.py                 # JWT OAuth2 authentication
│   ├── pdf_generator.py        # Commissioner briefing PDF engine
│   ├── requirements.txt        # Python package dependencies
│   ├── Dockerfile              # Docker configuration for Railway
│   └── ml/
│       ├── train.py            # ML models training pipeline
│       ├── routing.py          # Traffic routing & graph diversion algorithms
│       ├── hotspots.py         # DBSCAN incident clustering
│       └── models/             # Saved model binary files (.joblib)
└── frontend/
    ├── src/app/
    │   ├── page.tsx            # Main High-Fidelity Command Center dashboard
    │   ├── layout.tsx          # Root Next.js layout
    │   └── globals.css         # Core CSS configurations
    └── package.json            # Node.js dependencies
```

---

## 💻 Local Setup Guide

### 1. Backend Setup
Navigate to the `backend` folder, set up a virtual environment, install packages, and start the development server:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

### 2. Frontend Setup
Navigate to the `frontend` folder, install Node modules, and start the Next.js development server:
```bash
cd ../frontend
npm install
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.
