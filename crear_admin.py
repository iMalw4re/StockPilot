from database import SessionLocal, engine
import models
from passlib.context import CryptContext

# Esto asegura que las tablas existan (por si acaso)
models.Base.metadata.create_all(bind=engine)

# Configuración de contraseñas (Igual que en tu sistema)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def crear_super_admin():
    db = SessionLocal()
    print("📡 Conectando a la Base de Datos en la Nube...")
    
    try:
        # 1. Buscamos si ya existe el admin
        usuario = db.query(models.Usuario).filter(models.Usuario.username == "admin").first()
        
        if usuario:
            print("⚠️ El usuario 'admin' YA existe en la nube. No es necesario crearlo.")
        else:
            # 2. Si no existe, lo creamos
            print("👤 Creando usuario 'admin'...")
            
            # --- CAMBIA LA CONTRASEÑA AQUÍ SI QUIERES ---
            password_secreta = "admin123" 
            # --------------------------------------------
            
            nuevo_usuario = models.Usuario(
                username="admin",
                hashed_password=pwd_context.hash(password_secreta),
                rol="admin"
            )
            
            db.add(nuevo_usuario)
            db.commit()
            print(f"✅ ¡ÉXITO! Usuario: 'admin' / Password: '{password_secreta}' creado.")

    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    crear_super_admin()