# ==========================================
# ✈️ STOCKPILOT - MAIN BACKEND (GOLDEN VERSION)
# ==========================================

# --- 1. IMPORTS COMPLETOS (SIN DUPLICADOS) ---
from datetime import datetime, timedelta, date
from typing import List, Optional
from io import BytesIO

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func 
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import jwt, JWTError

# Imports para PDF y Excel
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import pandas as pd

# Imports locales
import models
import database

# --- 2. CONFIGURACIÓN INICIAL ---
# Crear tablas si no existen
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI() # 👈 SOLO UNA VEZ

# Configuración CORS
origins = ["*"] 
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 3. SEGURIDAD (TODO EN UNO) ---
SECRET_KEY = "tu_secreto_super_seguro"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 300

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- 4. DEPENDENCIAS DE BASE DE DATOS ---
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(models.Usuario).filter(models.Usuario.username == username).first()
    if user is None:
        raise credentials_exception
    return user

# --- 5. SCHEMAS (MODELOS DE DATOS) ---

# Productos
class ProductoBase(BaseModel):
    sku: str
    nombre: str
    descripcion: Optional[str] = None
    precio_compra: float
    precio_venta: float
    stock_actual: int
    punto_reorden: int = 5
    proveedor_default_id: Optional[int] = None

class ProductoCreate(ProductoBase):
    pass

class ProductoResponse(ProductoBase):
    id: int
    class Config:
        from_attributes = True

# Movimientos
class MovimientoCreate(BaseModel):
    sku: str  
    tipo_movimiento: str 
    cantidad: int
    usuario_responsable: str
    notas: Optional[str] = None

# Usuarios
class UsuarioCreate(BaseModel):
    username: str
    password: str
    rol: str = "vendedor" 

# Ventas
class ItemVenta(BaseModel):
    producto_id: int
    cantidad: int

class VentaCreate(BaseModel):
    items: List[ItemVenta]
    usuario_responsable: str

# Configuración
class ConfiguracionUpdate(BaseModel):
    nombre_tienda: str
    direccion: str
    telefono: str
    mensaje_ticket: str

# --- 6. RUTAS (ENDPOINTS) ---

# LOGIN
@app.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.Usuario).filter(models.Usuario.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.username, "rol": user.rol})
    return {"access_token": access_token, "token_type": "bearer", "rol": user.rol}

# PRODUCTOS
@app.get("/productos/", response_model=List[ProductoResponse])
def leer_productos(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    return db.query(models.Producto).order_by(models.Producto.id.asc()).all()

@app.post("/productos/", response_model=ProductoResponse)
def crear_producto(producto: ProductoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    if db.query(models.Producto).filter(models.Producto.sku == producto.sku).first():
        raise HTTPException(status_code=400, detail="El SKU ya existe")
    
    nuevo_producto = models.Producto(
        sku=producto.sku,
        nombre=producto.nombre,
        precio_compra=producto.precio_compra,
        precio_venta=producto.precio_venta,
        stock_actual=producto.stock_actual,
        punto_reorden=producto.punto_reorden,
        descripcion=producto.descripcion,
        proveedor_default_id=producto.proveedor_default_id
    )
    db.add(nuevo_producto)
    db.commit()
    db.refresh(nuevo_producto)
    return nuevo_producto

@app.put("/productos/{producto_id}", response_model=ProductoResponse)
def actualizar_producto(producto_id: int, producto_actualizado: ProductoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    producto_db = db.query(models.Producto).filter(models.Producto.id == producto_id).first()
    if not producto_db:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    # Actualización campo por campo
    producto_db.sku = producto_actualizado.sku
    producto_db.nombre = producto_actualizado.nombre
    producto_db.precio_compra = producto_actualizado.precio_compra
    producto_db.precio_venta = producto_actualizado.precio_venta
    producto_db.stock_actual = producto_actualizado.stock_actual
    producto_db.punto_reorden = producto_actualizado.punto_reorden
    producto_db.descripcion = producto_actualizado.descripcion
    
    db.commit()
    db.refresh(producto_db)
    return producto_db

@app.delete("/productos/{producto_id}")
def eliminar_producto(producto_id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    producto_db = db.query(models.Producto).filter(models.Producto.id == producto_id).first()
    if not producto_db:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    db.delete(producto_db)
    db.commit()
    return {"mensaje": "Eliminado correctamente"}

# MOVIMIENTOS
@app.post("/movimientos/")
def registrar_movimiento(movimiento: MovimientoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    # Buscar por SKU (String) o ID si falla
    producto = db.query(models.Producto).filter(models.Producto.sku == movimiento.sku).first()
    if not producto and movimiento.sku.isdigit():
         producto = db.query(models.Producto).filter(models.Producto.id == int(movimiento.sku)).first()

    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if movimiento.tipo_movimiento == "SALIDA" and producto.stock_actual < movimiento.cantidad:
            raise HTTPException(status_code=400, detail="Stock insuficiente")
    
    if movimiento.tipo_movimiento == "ENTRADA":
        producto.stock_actual += movimiento.cantidad
    elif movimiento.tipo_movimiento == "SALIDA":
        producto.stock_actual -= movimiento.cantidad

    nuevo_movimiento = models.Movimiento(
        producto_id=producto.id,
        tipo_movimiento=movimiento.tipo_movimiento,
        cantidad=movimiento.cantidad,
        usuario_responsable=movimiento.usuario_responsable,
        fecha_movimiento=datetime.now()
    )
    db.add(nuevo_movimiento)
    db.commit()
    return {"mensaje": "Exitoso"}

@app.get("/movimientos/")
def obtener_movimientos(fecha_inicio: str = None, fecha_fin: str = None, db: Session = Depends(get_db)):
    query = db.query(models.Movimiento).options(joinedload(models.Movimiento.producto))
    if fecha_inicio:
        dt = datetime.strptime(fecha_inicio, "%Y-%m-%d")
        query = query.filter(models.Movimiento.fecha_movimiento >= dt)
    if fecha_fin:
        dt = datetime.strptime(fecha_fin, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(models.Movimiento.fecha_movimiento < dt)
    return query.order_by(models.Movimiento.fecha_movimiento.desc()).all()

# FINANZAS Y REPORTES
@app.get("/reportes/valor-inventario")
def obtener_valor_inventario(db: Session = Depends(get_db)):
    valor = db.query(func.sum(models.Producto.stock_actual * models.Producto.precio_compra)).scalar() or 0
    return {"valor_total_almacen": valor}

@app.get("/reportes/corte_dia")
def corte_del_dia(db: Session = Depends(get_db)):
    hoy = date.today()
    manana = hoy + timedelta(days=1)
    movimientos = db.query(models.Movimiento).filter(
        models.Movimiento.fecha_movimiento >= hoy,
        models.Movimiento.fecha_movimiento < manana,
        models.Movimiento.tipo_movimiento == "SALIDA"
    ).all()
    
    total = sum(m.cantidad * (db.query(models.Producto).get(m.producto_id).precio_venta) for m in movimientos if db.query(models.Producto).get(m.producto_id))
    
    return {
        "fecha": hoy.strftime("%d/%m/%Y"),
        "total_vendido": total,
        "transacciones": len(movimientos)
    }

# USUARIOS
@app.get("/usuarios/")
def listar_usuarios(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    if current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    return db.query(models.Usuario).all()

@app.delete("/usuarios/{user_id}")
def eliminar_usuario(user_id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    if current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    db.query(models.Usuario).filter(models.Usuario.id == user_id).delete()
    db.commit()
    return {"mensaje": "Eliminado"}

# CONFIGURACION
@app.get("/configuracion/")
def obtener_config(db: Session = Depends(get_db)):
    conf = db.query(models.Configuracion).first()
    if not conf:
        conf = models.Configuracion()
        db.add(conf)
        db.commit()
    return conf

@app.post("/configuracion/")
def guardar_config(datos: ConfiguracionUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    conf = db.query(models.Configuracion).first()
    if not conf:
        conf = models.Configuracion()
        db.add(conf)
    conf.nombre_tienda = datos.nombre_tienda
    conf.direccion = datos.direccion
    conf.telefono = datos.telefono
    conf.mensaje_ticket = datos.mensaje_ticket
    db.commit()
    return {"mensaje": "Guardado"}

# --- 7. RUTA DE EMERGENCIA (RESET) ---
@app.get("/crear_admin_urgente")
def crear_admin_urgente():
    from database import engine, SessionLocal
    import models
    db = SessionLocal()
    try:
        models.Base.metadata.drop_all(bind=engine)
        models.Base.metadata.create_all(bind=engine)
        
        # Hash de "admin123"
        pass_segura = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxwKc.6qKzJUFy/8g.Z.H/6.A.Z6"
        nuevo_admin = models.Usuario(username="admin", hashed_password=pass_segura, rol="admin")
        db.add(nuevo_admin)
        db.commit()
        return {"mensaje": "✅ SISTEMA RESETEADO. Admin restaurado."}
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()

# --- 8. ARCHIVOS ESTÁTICOS (AL FINAL) ---
app.mount("/", StaticFiles(directory=".", html=True), name="static")