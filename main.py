# ==========================================
# ✈️ STOCKPILOT - MAIN BACKEND (VERSIÓN FINAL CON USUARIOS)
# ==========================================

from datetime import datetime, timedelta, date
from jose import jwt, JWTError
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func 
from pydantic import BaseModel
from typing import List, Optional
from passlib.context import CryptContext
import models
import database

# --- IMPORTS PARA PDF ---
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from io import BytesIO

# Imports para Excel
import pandas as pd
from fastapi import UploadFile, File

# 1. Crear las tablas automáticamente si no existen
models.Base.metadata.create_all(bind=database.engine)

# Configuración de Seguridad
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- CONFIGURACIÓN JWT ---
SECRET_KEY = "secreto_super_seguro_cambialo_en_produccion"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_password_hash(password):
    return pwd_context.hash(password)
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# 2. INICIALIZAR LA APP
app = FastAPI() 

# --- CONFIGURACIÓN CORS ---
origins = ["*"] 
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- DEPENDENCIA DE SEGURIDAD ---
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

# --- 1. SCHEMAS DE PRODUCTOS (El Corazón del Sistema) ---
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
    pass  # Hereda todo lo de arriba (sku, precios, stock, etc.)

class ProductoResponse(ProductoBase):
    id: int
    class Config:
        from_attributes = True  # Para que lea datos de SQLAlchemy

# --- 2. SCHEMAS DE MOVIMIENTOS ---
class MovimientoCreate(BaseModel):
    sku: str  # Usamos SKU para identificar
    tipo_movimiento: str # "entrada" o "salida"
    cantidad: int
    usuario_responsable: str
    notas: Optional[str] = None

# --- 3. SCHEMAS DE USUARIOS ---
class UsuarioCreate(BaseModel):
    username: str
    password: str
    rol: str = "vendedor" 

# --- 4. SCHEMAS DE VENTAS (Caja) ---
class ItemVenta(BaseModel):
    producto_id: int
    cantidad: int

class VentaCreate(BaseModel):
    items: List[ItemVenta]
    usuario_responsable: str

# --- 5. SCHEMAS DE CONFIGURACIÓN ---
class ConfiguracionUpdate(BaseModel):
    nombre_tienda: str
    direccion: str
    telefono: str
    mensaje_ticket: str

# --- RUTAS ---

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

@app.get("/productos/", response_model=List[ProductoResponse])
def leer_productos(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    return db.query(models.Producto).order_by(models.Producto.id.asc()).all()

@app.post("/movimientos/")
def registrar_movimiento(movimiento: MovimientoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    # 1. Buscar producto
    producto = db.query(models.Producto).filter(models.Producto.id == movimiento.producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # 2. Verificar Stock si es salida
    if movimiento.tipo_movimiento == "SALIDA":
        if producto.stock_actual < movimiento.cantidad:
            raise HTTPException(status_code=400, detail="Stock insuficiente")
    
    # 3. Actualizamos el stock manualmente
    if movimiento.tipo_movimiento == "ENTRADA":
        producto.stock_actual += movimiento.cantidad
    elif movimiento.tipo_movimiento == "SALIDA":
        producto.stock_actual -= movimiento.cantidad

    # 4. Registrar el movimiento
    nuevo_movimiento = models.Movimiento(
        producto_id=movimiento.producto_id,
        tipo_movimiento=movimiento.tipo_movimiento,
        cantidad=movimiento.cantidad,
        usuario_responsable=movimiento.usuario_responsable,
        fecha_movimiento=datetime.now()
    )
    
    try:
        db.add(nuevo_movimiento)
        db.commit() 
        db.refresh(nuevo_movimiento)
        db.refresh(producto) 
        return {"mensaje": "Movimiento exitoso", "nuevo_stock": producto.stock_actual}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

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

# --- VERSIÓN DE DIAGNÓSTICO PARA ENCONTRAR EL ERROR ---
@app.post("/registrar/")
def registrar_usuario(usuario: UsuarioCreate, db: Session = Depends(get_db)):
    try:
        # 1. Verificar si ya existe
        existe = db.query(models.Usuario).filter(models.Usuario.username == usuario.username).first()
        if existe:
            raise HTTPException(status_code=400, detail="El usuario ya existe")
        
        # 2. Intentar hashear la contraseña (AQUÍ SUELE FALLAR)
        print(f"Intentando hashear password para {usuario.username}...")
        hashed_password = get_password_hash(usuario.password)
        
        # 3. Intentar crear el modelo (AQUÍ FALLA SI LA BD NO TIENE ROL)
        print("Creando objeto usuario...")
        nuevo_usuario = models.Usuario(
            username=usuario.username,
            hashed_password=hashed_password,
            rol=usuario.rol
        )
        
        # 4. Intentar guardar en BD
        print("Guardando en base de datos...")
        db.add(nuevo_usuario)
        db.commit()
        db.refresh(nuevo_usuario)
        
        return {"mensaje": f" ÉXITO: Usuario {nuevo_usuario.username} creado."}

    except Exception as e:
        # SI ALGO FALLA, IMPRIMIMOS EL ERROR REAL
        print(f"❌ ERROR GRAVE: {str(e)}")
        # Y lo devolvemos al frontend para que lo veas en la alerta
        raise HTTPException(status_code=500, detail=f"Fallo el servidor: {str(e)}")

@app.get("/usuarios/")
def listar_usuarios(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    # Solo los admins pueden ver la lista
    if current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="No tienes permisos de administrador")
    return db.query(models.Usuario).all()

@app.delete("/usuarios/{user_id}")
def eliminar_usuario(user_id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    if current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    
    usuario_a_borrar = db.query(models.Usuario).filter(models.Usuario.id == user_id).first()
    if not usuario_a_borrar:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    db.delete(usuario_a_borrar)
    db.commit()
    return {"mensaje": "Usuario eliminado"}

# --- LOGIN MODIFICADO PARA DEVOLVER ROL ---
@app.post("/token")
def login_para_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.Usuario).filter(models.Usuario.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.username})
    
    # Devolvemos el Rol para que el Frontend sepa qué mostrar
    rol_usuario = getattr(user, "rol", "vendedor") # Si no tiene rol, es vendedor
    
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "rol": rol_usuario,
        "username": user.username
    }

@app.get("/reportes/valor-inventario")
def obtener_valor_inventario(db: Session = Depends(get_db)):
    valor = db.query(func.sum(models.Producto.stock_actual * models.Producto.precio_compra)).scalar() or 0
    return {"valor_total_almacen": valor}

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

@app.post("/ventas/checkout")
def procesar_venta(venta: VentaCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    # 1. Validar Stock Total
    for item in venta.items:
        producto = db.query(models.Producto).filter(models.Producto.id == item.producto_id).first()
        if not producto:
            raise HTTPException(status_code=404, detail=f"Producto ID {item.producto_id} no encontrado")
        if producto.stock_actual < item.cantidad:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente para {producto.nombre}")

    # 2. Registrar movimientos y descontar stock
    try:
        total_items = 0
        for item in venta.items:
            producto = db.query(models.Producto).filter(models.Producto.id == item.producto_id).first()
            producto.stock_actual -= item.cantidad # Resta manual
            
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

@app.get("/configuracion/")
def obtener_configuracion(db: Session = Depends(get_db)):
    config = db.query(models.Configuracion).first()
    if not config:
        config = models.Configuracion()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

@app.post("/configuracion/")
def guardar_configuracion(datos: ConfiguracionUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    config = db.query(models.Configuracion).first()
    config.nombre_tienda = datos.nombre_tienda
    config.direccion = datos.direccion
    config.telefono = datos.telefono
    config.mensaje_ticket = datos.mensaje_ticket
    db.commit()
    db.refresh(config)
    return {"mensaje": "Configuración guardada", "config": config}

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
    c.drawString(100, 705, f"Atendido por: {venta.usuario_responsable}")
    c.line(100, 695, 500, 695)

    y = 675
    c.setFont("Helvetica-Bold", 10)
    c.drawString(100, y, "CANT")
    c.drawString(140, y, "PRODUCTO")
    c.drawString(350, y, "PRECIO U.")
    c.drawString(430, y, "TOTAL")
    
    y -= 20
    c.setFont("Helvetica", 10)
    total_venta = 0
    
    for item in venta.items:
        prod = db.query(models.Producto).filter(models.Producto.id == item.producto_id).first()
        if prod:
            subtotal = prod.precio_venta * item.cantidad
            total_venta += subtotal
            c.drawString(100, y, str(item.cantidad))
            c.drawString(140, y, prod.nombre[:25])
            c.drawString(350, y, f"${prod.precio_venta:,.2f}")
            c.drawString(430, y, f"${subtotal:,.2f}")
            y -= 15

    c.line(100, y-5, 500, y-5)
    y -= 25
    c.setFont("Helvetica-Bold", 14)
    c.drawString(350, y, "TOTAL:")
    c.drawString(430, y, f"${total_venta:,.2f}")
    y -= 40
    c.setFont("Helvetica-Oblique", 10)
    c.drawString(100, y, mensaje)
    
    c.showPage()
    c.save()
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=ticket.pdf"})

@app.post("/productos/importar_excel")
async def importar_excel(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    contents = await file.read()
    df = pd.read_excel(BytesIO(contents))
    columnas_necesarias = ['sku', 'nombre', 'precio_compra', 'precio_venta', 'stock', 'reorden']
    df.columns = [c.lower() for c in df.columns]
    
    if not all(col in df.columns for col in columnas_necesarias):
        raise HTTPException(status_code=400, detail=f"El Excel debe tener las columnas: {columnas_necesarias}")

    nuevos = 0
    actualizados = 0

    for index, row in df.iterrows():
        sku_buscado = str(row['sku'])
        producto_existente = db.query(models.Producto).filter(models.Producto.sku == sku_buscado).first()
        
        if producto_existente:
            producto_existente.nombre = row['nombre']
            producto_existente.precio_compra = row['precio_compra']
            producto_existente.precio_venta = row['precio_venta']
            producto_existente.stock_actual = int(row['stock'])
            producto_existente.punto_reorden = int(row['reorden'])
            actualizados += 1
        else:
            nuevo_prod = models.Producto(
                sku = sku_buscado,
                nombre = row['nombre'],
                precio_compra = row['precio_compra'],
                precio_venta = row['precio_venta'],
                stock_actual = int(row['stock']),
                punto_reorden = int(row['reorden'])
            )
            db.add(nuevo_prod)
            nuevos += 1
            
    db.commit()
    return {"mensaje": "Proceso completado", "nuevos": nuevos, "actualizados": actualizados}

@app.get("/productos/exportar_excel")
def exportar_excel(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    productos = db.query(models.Producto).all()
    data = []
    for p in productos:
        data.append({
            "sku": p.sku,
            "nombre": p.nombre,
            "precio_compra": p.precio_compra,
            "precio_venta": p.precio_venta,
            "stock": p.stock_actual,
            "reorden": p.punto_reorden
        })
    df = pd.DataFrame(data)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name="Inventario")
    output.seek(0)
    headers = {"Content-Disposition": "attachment; filename=inventario_completo.xlsx"}
    return StreamingResponse(output, headers=headers, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

# --- CORTE DE CAJA (COMPATIBLE CON POSTGRESQL) ---
@app.get("/reportes/corte_dia")
def corte_del_dia(db: Session = Depends(get_db)):
    hoy = date.today()
    manana = hoy + timedelta(days=1) # Truco para filtrar rangos

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

@app.delete("/movimientos/limpiar")
def limpiar_historial(fecha_limite: str, clave_admin: str, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    CLAVE_SEGURIDAD = "admin2026" 
    if clave_admin != CLAVE_SEGURIDAD:
        raise HTTPException(status_code=403, detail="⛔ Clave de seguridad incorrecta.")

    fecha_dt = datetime.strptime(fecha_limite, "%Y-%m-%d")
    registros_borrados = db.query(models.Movimiento).filter(
        models.Movimiento.fecha_movimiento < fecha_dt
    ).delete()
    db.commit()
    return {"mensaje": f"✅ Se eliminaron {registros_borrados} movimientos antiguos."}

# --- 🚨 RESCATE DE EMERGENCIA: CREAR ADMIN AUTOMÁTICO 🚨 ---
@app.get("/crear_admin_urgente")
def crear_admin_urgente(db: Session = Depends(get_db)):
    # 1. Definimos los datos MANUALMENTE (Aquí no hay error posible)
    nombre = "admin"
    pass_texto = "123"
    
    # 2. Borramos si ya existe (para evitar duplicados)
    existente = db.query(models.Usuario).filter(models.Usuario.username == nombre).first()
    if existente:
        db.delete(existente)
        db.commit()
    
    # 3. Lo creamos de nuevo, limpio y perfecto
    hashed_password = get_password_hash(pass_texto)
    nuevo_usuario = models.Usuario(
        username=nombre,
        hashed_password=hashed_password,
        rol="admin"
    )
    
    db.add(nuevo_usuario)
    db.commit()
    
    return {"mensaje": "✅ LISTO: Usuario 'admin' con contraseña '123' creado forzosamente."}

# --- ZONA DE ARCHIVOS ESTÁTICOS ---
@app.get("/")
async def read_index():
    return FileResponse("index.html")

app.mount("/", StaticFiles(directory=".", html=True), name="static")

# --- 🧨 ZONA DE PELIGRO: RUTAS DE MANTENIMIENTO 🧨 ---

@app.get("/reset_database_urgente")
def reset_database():
    """
    ¡ADVERTENCIA! Esta ruta BORRA TODA LA BASE DE DATOS y la crea de nuevo.
    Úsala solo cuando cambies la estructura de las tablas (como ahora).
    """
    from database import engine, Base
    
    # 1. Borrar todo (Drop All)
    Base.metadata.drop_all(bind=engine)
    
    # 2. Crear todo nuevo (Create All)
    Base.metadata.create_all(bind=engine)
    
    return {"mensaje": "✅ Base de datos reseteada. Tablas nuevas creadas (precio_compra, stock_actual, etc). ¡Ahora crea tu admin!"}