import os
from datetime import datetime
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from passlib.hash import bcrypt

# Load environment variables
load_dotenv()

# Get Database URL from env or fallback to SQLite locally
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./smartflow.db")

from sqlalchemy import text

# SQLite adjustments
connect_args = {}
engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    # For remote PostgreSQL (e.g. Neon serverless), set connection pooling options
    # to handle auto-suspension and connection drops gracefully.
    engine_kwargs = {
        "pool_pre_ping": True,       # Verify connections are alive before using them
        "pool_recycle": 300,          # Recycle connections every 5 minutes
        "pool_size": 5,              # Keep up to 5 connections in the pool
        "max_overflow": 10,           # Allow up to 10 additional connections under load
    }
    connect_args = {"connect_timeout": 10}

class DynamicSessionmaker:
    def __init__(self, postgres_url, connect_args, engine_kwargs):
        self.sqlite_engine = create_engine("sqlite:///./smartflow.db", connect_args={"check_same_thread": False})
        self.sqlite_sessionmaker = sessionmaker(autocommit=False, autoflush=False, bind=self.sqlite_engine)
        
        self.postgres_engine = None
        self.postgres_sessionmaker = None
        
        if postgres_url and not postgres_url.startswith("sqlite"):
            try:
                self.postgres_engine = create_engine(postgres_url, connect_args=connect_args, **engine_kwargs)
                self.postgres_sessionmaker = sessionmaker(autocommit=False, autoflush=False, bind=self.postgres_engine)
            except Exception as e:
                print(f"Warning: Failed to create PostgreSQL engine: {e}. Falling back to SQLite.")
                self.postgres_engine = None
                self.postgres_sessionmaker = None

    def __call__(self):
        if self.postgres_sessionmaker:
            try:
                db = self.postgres_sessionmaker()
                db.execute(text("SELECT 1"))
                return db
            except Exception as e:
                print(f"Database connection lost or failed: {e}. Falling back to local SQLite.")
                self.postgres_sessionmaker = None
                self.postgres_engine = None
                return self.sqlite_sessionmaker()
        else:
            return self.sqlite_sessionmaker()

SessionLocal = DynamicSessionmaker(DATABASE_URL, connect_args, engine_kwargs)
engine = SessionLocal.postgres_engine if SessionLocal.postgres_engine else SessionLocal.sqlite_engine
Base = declarative_base()

# ----------------- Database Models -----------------

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False)  # admin, supervisor, traffic_police
    created_at = Column(DateTime, default=datetime.utcnow)

class Incident(Base):
    __tablename__ = "incidents"
    
    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String, nullable=False)
    event_cause = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    corridor = Column(String, nullable=False)
    zone = Column(String, nullable=False)
    police_station = Column(String, nullable=False)
    junction = Column(String, nullable=False)
    priority = Column(String, nullable=False)
    requires_road_closure = Column(Boolean, default=False)
    vehicle_type = Column(String, nullable=False)
    start_datetime = Column(DateTime, nullable=False)
    end_datetime = Column(DateTime, nullable=True)
    status = Column(String, default="Active")  # Active, Cleared
    created_at = Column(DateTime, default=datetime.utcnow)

# ----------------- Helper functions -----------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    global engine
    
    # Try PostgreSQL first if configured
    if SessionLocal.postgres_engine:
        try:
            Base.metadata.create_all(bind=SessionLocal.postgres_engine)
            print("PostgreSQL database tables created successfully!")
            engine = SessionLocal.postgres_engine
            seed_data()
            return
        except Exception as e:
            print(f"Warning: Failed to initialize PostgreSQL tables: {e}. Falling back to SQLite.")
            SessionLocal.postgres_engine = None
            SessionLocal.postgres_sessionmaker = None
            
    # SQLite fallback
    engine = SessionLocal.sqlite_engine
    Base.metadata.create_all(bind=SessionLocal.sqlite_engine)
    print("SQLite database tables created successfully!")
    seed_data()

def seed_data():
    db = SessionLocal()
    try:
        # Check if users already seeded
        if db.query(User).count() == 0:
            print("Seeding users table...")
            
            # Use passlib.hash.bcrypt for password hashing. We use bcrypt rounds=12 or default.
            # We want quick verification, so we can pre-generate hashed passwords.
            users_to_seed = [
                User(
                    username="admin",
                    hashed_password=bcrypt.hash("admin123"),
                    full_name="Command Center Admin",
                    role="admin"
                ),
                User(
                    username="supervisor",
                    hashed_password=bcrypt.hash("supervisor123"),
                    full_name="Traffic Area Supervisor",
                    role="supervisor"
                ),
                User(
                    username="officer",
                    hashed_password=bcrypt.hash("officer123"),
                    full_name="Field Officer Ramesh",
                    role="traffic_police"
                )
            ]
            db.add_all(users_to_seed)
            db.commit()
            print("Users seeded successfully! Credentials:")
            print(" - admin / admin123 (Role: admin)")
            print(" - supervisor / supervisor123 (Role: supervisor)")
            print(" - officer / officer123 (Role: traffic_police)")
            
        # Check if incidents already seeded
        if db.query(Incident).count() == 0:
            csv_path = "c:/Users/hp/Desktop/EventManager/backend/ml/traffic_incidents.csv"
            if os.path.exists(csv_path):
                import pandas as pd
                print("Seeding initial incidents from generated dataset...")
                df = pd.read_csv(csv_path)
                
                # Load first 150 incidents to seed
                seed_count = min(150, len(df))
                seeded_incidents = []
                
                def clean_val(val, default="None"):
                    if pd.isna(val) or val is None or str(val).lower() == 'nan':
                        return default
                    return str(val)
                
                for index, row in df.iloc[:seed_count].iterrows():
                    # Randomly assign status (recent 30 are active, rest cleared)
                    status = "Active" if index < 25 else "Cleared"
                    
                    incident = Incident(
                        event_type=clean_val(row['event_type'], "Other"),
                        event_cause=clean_val(row['event_cause'], "Other"),
                        latitude=float(row['latitude']) if pd.notna(row['latitude']) else 12.9716,
                        longitude=float(row['longitude']) if pd.notna(row['longitude']) else 77.5946,
                        corridor=clean_val(row['corridor'], "Other Corridor"),
                        zone=clean_val(row['zone'], "Central Zone"),
                        police_station=clean_val(row['police_station'], "General Traffic PS"),
                        junction=clean_val(row['junction'], "Unknown Junction"),
                        priority=clean_val(row['priority'], "Low"),
                        requires_road_closure=bool(row['requires_road_closure']) if pd.notna(row['requires_road_closure']) else False,
                        vehicle_type=clean_val(row['vehicle_type'], "None"),
                        start_datetime=datetime.strptime(str(row['start_datetime']), "%Y-%m-%d %H:%M:%S") if pd.notna(row['start_datetime']) else datetime.utcnow(),
                        end_datetime=datetime.strptime(str(row['end_datetime']), "%Y-%m-%d %H:%M:%S") if pd.notna(row['end_datetime']) and str(row['end_datetime']).lower() != 'nan' else None,
                        status=status
                    )
                    seeded_incidents.append(incident)
                    
                db.add_all(seeded_incidents)
                db.commit()
                print(f"Seeded {len(seeded_incidents)} incidents successfully!")
            else:
                print("traffic_incidents.csv not found. Database seeded with no incidents. Please run generator and seed later.")
    except Exception as e:
        print(f"Error seeding data: {e}")
        db.rollback()
    finally:
        db.close()
