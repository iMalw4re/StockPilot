from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# --- CONFIGURACIÓN ---
# ¡OJO! Cambia 'tu_contraseña' por la real y 'nombre_bd' por la que creaste en Postgres
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:mcr181122@localhost/Logistica"

# Creamos el motor de conexión
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# Creamos la sesión
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Clase base para los modelos
Base = declarative_base()

# Dependencia (Esta función es MUY importante para FastAPI)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()