import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# --- CONFIGURACIÓN HÍBRIDA (NUBE / LOCAL) ---

# 1. Intentamos leer la dirección de la Nube (Variable de Entorno)
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

# 2. Si no existe (porque estás en tu compu), usamos la local
if not SQLALCHEMY_DATABASE_URL:
    # CAMBIA ESTO POR TUS DATOS LOCALES (Como lo tenías antes)
    SQLALCHEMY_DATABASE_URL = "postgresql://postgres:mcr181122@localhost/Logistica"
else:
    # Corrección para Render (a veces da la url con postgres:// y SQLAlchemy pide postgresql://)
    if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()