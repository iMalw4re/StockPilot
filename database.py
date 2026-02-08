import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# --- CONFIGURACIÓN HÍBRIDA (NUBE / LOCAL) ---

# 1. Intentamos leer la dirección de la Nube (Variable de Entorno)
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

# 2. Si no existe (porque estás en tu compu), usamos la local
    # CAMBIA ESTO POR TUS DATOS DE NEON TECH 👇
    # Pega aquí el enlace largo. RECUERDA: Que empiece con 'postgresql://' (con ql)
    # 2. Si no existe (porque estás en tu compu), usamos la local
if not SQLALCHEMY_DATABASE_URL:
    # ✅ ASÍ DEBE QUEDAR (Sin 'psql', entre comillas y asignado a la variable):
    SQLALCHEMY_DATABASE_URL = "postgresql://neondb_owner:npg_wDjB5lvA2nsa@ep-holy-queen-aigdnl43-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"
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