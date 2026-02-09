# ==========================================
# ✈️ STOCKPILOT - MAIN BACKEND (VERSIÓN FINAL BLINDADA)
# ==========================================

from datetime import datetime, timedelta, date
from typing import List, Optional
from io import BytesIO

# --- IMPORTS DE FASTAPI Y BASE DE DATOS ---
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

# --- IMPORTS DE TERCEROS (PDF Y EXCEL) ---
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import pandas as pd

# --- IMPORTS LOCALES ---
import models
import database

# 1. Crear las tablas automáticamente si no existen
models.Base.metadata.create_all(bind=database.engine)

# 2. INICIALIZAR LA APP
app = FastAPI()

# --- CONFIGURACIÓN DE SEGURIDAD (JWT) ---
SECRET_KEY = "tu_secreto_super_seguro_cambialo_en_produccion"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 300

# Configuración de hashing de contraseñas
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- FUNCIONES DE SEGURIDAD ---
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

# --- CONFIGURACIÓN CORS ---
origins = ["*"] 
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DEPENDENCIAS DE BASE DE DATOS ---
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=401,
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

# ==========================================
# 📋 SCHEMAS (MODELOS DE DATOS PYDANTIC)
# ==========================================

# 1. PRODUCTOS
class ProductoBase(BaseModel):
    sku: str
    nombre: str
    descripcion: Optional[str] = None
    precio_compra: float   # 💰 Vital para Finanzas
    precio_venta: float    # 💰 Vital para Ventas
    stock_actual: int      # 📦 Tu inventario real
    punto_reorden: int = 5
    proveedor_default_id: Optional[int] = None

class ProductoCreate(ProductoBase):
    pass

class ProductoResponse(ProductoBase):
    id: int
    class Config:
        from_attributes = True

# 2. MOVIMIENTOS
class MovimientoCreate(BaseModel):
    sku: str  
    tipo_movimiento: str # "entrada" o "salida"
    cantidad: int
    usuario_responsable: str
    notas: Optional[str] = None

# 3. USUARIOS
class UsuarioCreate(BaseModel):
    username: str
    password: str
    rol: str = "vendedor" 

# 4. VENTAS (CAJA)
class ItemVenta(BaseModel):
    producto_id: int
    cantidad: int

class VentaCreate(BaseModel):
    items: List[ItemVenta]
    usuario_responsable: str

# 5. CONFIGURACIÓN
class ConfiguracionUpdate(BaseModel):
    nombre_tienda: str
    direccion: str
    telefono: str
    mensaje_ticket: str


# ==========================================
# 🛣️ RUTAS DEL SISTEMA
# ==========================================

# --- LOGIN (AUTENTICACIÓN) ---
@app.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # 1. Buscar usuario
    user = db.query(models.Usuario).filter(models.Usuario.username == form_data.username).first()
    
    # 2. Verificar contraseña
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 3. Crear token
    access_token = create_access_token(data={"sub": user.username, "rol": user.rol})
    return {"access_token": access_token, "token_type": "bearer", "rol": user.rol}

# --- PRODUCTOS ---
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
    return {"mensaje": f"Producto {producto_id} eliminado correctamente"}

# --- MOVIMIENTOS ---
@app.post("/movimientos/")
def registrar_movimiento(movimiento: MovimientoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    producto = db.query(models.Producto).filter(models.Producto.id == movimiento.sku).first() # Ojo: aquí asumimos que frontend manda ID o SKU
    # Si frontend manda SKU string, cambiar filtro a: models.Producto.sku == movimiento.sku
    # Para simplificar, buscaremos por ID si es numérico o SKU si es texto.
    
    # Parche rápido: Vamos a buscar por ID porque tu JS manda ID en 'sku' a veces
    producto = db.query(models.Producto).filter(models.Producto.sku == movimiento.sku).first()
    if not producto:
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
    return {"mensaje": "Movimiento exitoso", "nuevo_stock": producto.stock_actual}

@app.get("/movimientos/")
def obtener_movimientos(fecha_inicio: str = None, fecha_fin: str = None, db: Session = Depends(get_db)):
    query = db.query(models.Movimiento).options(joinedload(models.Movimiento.producto))
    if fecha_inicio:
        fecha_dt = datetime.strptime(fecha_inicio, "%Y-%m-%d")
        query = query.filter(models.Movimiento.fecha_movimiento >= fecha_dt)
    if fecha_fin:
        fecha_dt = datetime.strptime(fecha_fin, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(models.Movimiento.fecha_movimiento < fecha_dt)
    return query.order_by(models.Movimiento.fecha_movimiento.desc()).all()

# --- VENTAS Y REPORTES ---
@app.post("/ventas/checkout")
def procesar_venta(venta: VentaCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    for item in venta.items:
        producto = db.query(models.Producto).filter(models.Producto.id == item.producto_id).first()
        if not producto:
            raise HTTPException(status_code=404, detail=f"Producto ID {item.producto_id} no encontrado")
        if producto.stock_actual < item.cantidad:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente para {producto.nombre}")

    try:
        total_items = 0
        for item in venta.items:
            producto = db.query(models.Producto).filter(models.Producto.id == item.producto_id).first()
            producto.stock_actual -= item.cantidad 
            
            nuevo_movimiento = models.Movimiento(
                producto_id=item.producto_id,
                tipo_movimiento="SALIDA",
                cantidad=item.cantidad,
                usuario_responsable=venta.usuario_responsable,
                fecha_movimiento=datetime.now()
            )
            db.add(nuevo_movimiento)
            total_items += 1
            
        db.commit()
        return {"mensaje": "Venta exitosa", "items_procesados": total_items}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/reportes/corte_dia")
def corte_del_dia(db: Session = Depends(get_db)):
    hoy = date.today()
    manana = hoy + timedelta(days=1)
    movimientos = db.query(models.Movimiento).filter(
        models.Movimiento.fecha_movimiento >= hoy,
        models.Movimiento.fecha_movimiento < manana,
        models.Movimiento.tipo_movimiento == "SALIDA"
    ).all()
    
    total_dinero = 0
    total_items = 0
    desglose = []

    for mov in movimientos:
        prod = db.query(models.Producto).filter(models.Producto.id == mov.producto_id).first()
        if prod:
            venta = mov.cantidad * prod.precio_venta
            total_dinero += venta
            total_items += mov.cantidad
            desglose.append({
                "producto": prod.nombre,
                "cantidad": mov.cantidad,
                "subtotal": venta,
                "hora": mov.fecha_movimiento.strftime("%H:%M") 
            })
            
    return {
        "fecha": hoy.strftime("%d/%m/%Y"),
        "total_vendido": total_dinero,
        "items_vendidos": total_items,
        "transacciones": len(movimientos),
        "detalle": desglose
    }

@app.get("/reportes/valor-inventario")
def obtener_valor_inventario(db: Session = Depends(get_db)):
    valor = db.query(func.sum(models.Producto.stock_actual * models.Producto.precio_compra)).scalar() or 0
    return {"valor_total_almacen": valor}

# --- PDF Y EXCEL ---
@app.post("/ventas/ticket_pdf")
def generar_ticket(venta: VentaCreate, db: Session = Depends(get_db)):
    config = db.query(models.Configuracion).first()
    nombre_tienda = config.nombre_tienda if config else "Mi Tienda"
    direccion = config.direccion if config else ""
    mensaje = config.mensaje_ticket if config else "Gracias por su compra"

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(100, 750, nombre_tienda)
    c.setFont("Helvetica", 10)
    c.drawString(100, 735, direccion)
    c.drawString(100, 720, f"Fecha: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    c.line(100, 695, 500, 695)

    y = 675
    total_venta = 0
    for item in venta.items:
        prod = db.query(models.Producto).filter(models.Producto.id == item.producto_id).first()
        if prod:
            subtotal = prod.precio_venta * item.cantidad
            total_venta += subtotal
            c.drawString(100, y, f"{item.cantidad} x {prod.nombre} - ${subtotal}")
            y -= 15

    c.line(100, y-5, 500, y-5)
    c.drawString(350, y-25, f"TOTAL: ${total_venta}")
    c.showPage()
    c.save()
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=ticket.pdf"})

@app.post("/productos/importar_excel")
async def importar_excel(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    contents = await file.read()
    df = pd.read_excel(BytesIO(contents))
    # Lógica simplificada de importación
    nuevos = 0
    for index, row in df.iterrows():
        # Aquí iría tu lógica de validación e inserción...
        pass 
    return {"mensaje": "Importación (simulada) completada"}

@app.get("/productos/exportar_excel")
def exportar_excel(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    productos = db.query(models.Producto).all()
    data = [{"sku": p.sku, "nombre": p.nombre, "stock": p.stock_actual} for p in productos]
    df = pd.DataFrame(data)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

# --- CONFIGURACIÓN ---
@app.get("/configuracion/")
def obtener_configuracion(db: Session = Depends(get_db)):
    config = db.query(models.Configuracion).first()
    if not config:
        config = models.Configuracion()
        db.add(config)
        db.commit()
    return config

@app.post("/configuracion/")
def guardar_configuracion(datos: ConfiguracionUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    config = db.query(models.Configuracion).first()
    if not config:
        config = models.Configuracion()
        db.add(config)
    
    config.nombre_tienda = datos.nombre_tienda
    config.direccion = datos.direccion
    config.telefono = datos.telefono
    config.mensaje_ticket = datos.mensaje_ticket
    db.commit()
    return {"mensaje": "Guardado"}

# --- USUARIOS ---
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
    return {"mensaje": "Usuario eliminado"}


# ==========================================
# 🚨 RUTA DE EMERGENCIA (RESET BD)
# ==========================================
@app.get("/crear_admin_urgente")
def crear_admin_urgente():
    """
    Ruta de rescate: Borra DB, Crea Tablas, Crea Admin.
    Usuario: admin | Pass: admin123
    """
    from database import engine, SessionLocal
    import models
    db = SessionLocal()
    try:
        models.Base.metadata.drop_all(bind=engine)
        models.Base.metadata.create_all(bind=engine)
        
        # Hash de "admin123"
        pass_segura = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxwKc.6qKzJUFy/8g.Z.H/6.A.Z6"
        
        nuevo_admin = models.Usuario(
            username="admin", hashed_password=pass_segura, rol="admin"
        )
        db.add(nuevo_admin)
        db.commit()
        return {"mensaje": "✅ SISTEMA REINICIADO. Usuario: admin | Pass: admin123"}
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()

# --- AL FINAL: SERVIR ARCHIVOS ESTÁTICOS ---
app.mount("/", StaticFiles(directory=".", html=True), name="static")