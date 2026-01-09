# ==========================================
# ✈️ STOCKPILOT - MAIN BACKEND (COMPATIBLE CON MODELO AVANZADO)
# ==========================================
#librerias de seguridad y autenticacion 
#En programación, eso se llama JWT (JSON Web Token). Vamos a crear una ruta que reciba usuario y contraseña, y si son correctos, devuelva ese Token.
from datetime import datetime, timedelta, date
from jose import jwt, JWTError
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from fastapi import FastAPI, Depends, HTTPException # Manejo de excepciones
from fastapi.middleware.cors import CORSMiddleware  # Para permitir CORS
from sqlalchemy.orm import Session, joinedload  # Para manejar sesiones de la base de datos
from sqlalchemy import func # Función especial de SQL llamada func que nos permite hacer sumas matemáticas
from pydantic import BaseModel # Para validar datos que entran (Schemas)
from typing import List, Optional # Agregamos Optional
from passlib.context import CryptContext # Para hashear contraseñas
import models # Importamos los modelos
import database # Importamos la configuración de la base de datos

# --- IMPORTS PARA PDF (Pégalos arriba en main.py) ---
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from io import BytesIO
from fastapi.responses import StreamingResponse

# Imports para Excel y Archivos
import pandas as pd
from fastapi import UploadFile, File
from io import BytesIO

models.Base.metadata.create_all(bind=database.engine) # 1. Crear las tablas automáticamente si no existen (Aunque ya las creaste en SQL, esto asegura que Python las reconozca)

# Configuración de Seguridad
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- CONFIGURACIÓN JWT (Tokens de Acceso) ---
SECRET_KEY = "secreto_super_seguro_cambialo_en_produccion" # 🔑 Llave maestra
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 # El token dura 30 mins

# Esto le dice a FastAPI que la ruta para loguearse es "/token"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# Funciones de utilidad para manejar contraseñas
def get_password_hash(password):
    return pwd_context.hash(password)
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# 2. INICIALIZAR LA APP (UNA SOLA VEZ)
app = FastAPI() 

# --- 2. CONFIGURACIÓN DE SEGURIDAD (CORS) ---
# Esto permite que tu HTML local se conecte con tu Python
origins = ["*"] # Permitir todas las fuentes (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():   # Dependencia para obtener la sesión de la base de datos
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- DEPENDENCIA DE SEGURIDAD (El Cadenero) ---
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Intentamos decodificar el token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    # Buscamos si el usuario aún existe en la BD
    user = db.query(models.Usuario).filter(models.Usuario.username == username).first()
    if user is None:
        raise credentials_exception
        
    return user

# --- SCHEMAS (Adaptados a tu modelo avanzado) ---
class ProductoBase(BaseModel):
    sku: str
    nombre: str
    precio_compra: float
    precio_venta: float
    stock_actual: int
    punto_reorden: int
    # Opcionales porque al inicio quizás no tengas proveedor
    proveedor_default_id: Optional[int] = None 
    descripcion: Optional[str] = None

class ProductoCreate(ProductoBase):
    pass

class ProductoResponse(ProductoBase):
    id: int
    class Config:
        from_attributes = True

class MovimientoCreate(BaseModel):
    producto_id: int
    tipo_movimiento: str
    cantidad: int
    usuario_responsable: str

class UsuarioCreate(BaseModel):
    username: str
    password: str


# --- NUEVOS SCHEMAS PARA VENTA MASIVA ---
class ItemVenta(BaseModel):
    producto_id: int
    cantidad: int

class VentaCreate(BaseModel):
    items: List[ItemVenta] # Recibe una lista de items
    usuario_responsable: str

# --- SCHEMA DE CONFIGURACIÓN ---
class ConfiguracionUpdate(BaseModel):
    nombre_tienda: str
    direccion: str
    telefono: str
    mensaje_ticket: str


# --- RUTAS ---

@app.post("/productos/", response_model=ProductoResponse)
def crear_producto(
    producto: ProductoCreate, 
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user) 
    ):
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
def leer_productos(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user) # 👈 El Cadenero
):
    return db.query(models.Producto).all()

@app.post("/movimientos/")
def registrar_movimiento(
        movimiento: MovimientoCreate, 
        db: Session = Depends(get_db),
        current_user: models.Usuario = Depends(get_current_user) 
    ):
    # 1. Buscamos el producto
    producto = db.query(models.Producto).filter(models.Producto.id == movimiento.producto_id).first()
    
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # 2. VALIDACIÓN: Aunque el Trigger hace el cálculo, 
    # es buena práctica evitar que la venta pase si no hay stock suficiente.
    if movimiento.tipo_movimiento == "SALIDA": # Ojo: Asegúrate que coincida con lo que espera tu Trigger ('VENTA', 'AJUSTE_SALIDA', etc.)
        if producto.stock_actual < movimiento.cantidad:
            raise HTTPException(status_code=400, detail="Stock insuficiente")
    
    # --- AQUÍ QUITAMOS LA LÓGICA MATEMÁTICA MANUAL ---
    # Ya no hacemos sumas ni restas aquí. Confiamos en el Trigger.

    # 3. Creamos el objeto movimiento
    nuevo_movimiento = models.Movimiento(
        producto_id=movimiento.producto_id,
        tipo_movimiento=movimiento.tipo_movimiento,
        cantidad=movimiento.cantidad,
        usuario_responsable=movimiento.usuario_responsable
        # Nota: Ubicacion y notas quedan vacios por ahora
    )
    
    try:
        db.add(nuevo_movimiento)
        db.commit() # <--- ¡AQUÍ DISPARA EL TRIGGER EN LA BD! 🔫
        
        # 4. Refrescamos los datos para ver qué hizo la base de datos
        db.refresh(nuevo_movimiento)
        db.refresh(producto) # 👈 IMPORTANTE: Le pedimos a la BD el stock actualizado por el trigger
        
        return {"mensaje": "Movimiento exitoso", "nuevo_stock": producto.stock_actual}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# --- ESTO ES LO QUE TE FALTA ---
# --- OBTENER MOVIMIENTOS CON FILTRO DE FECHA ---
@app.get("/movimientos/")
def obtener_movimientos(
    fecha_inicio: str = None, # Formato YYYY-MM-DD
    fecha_fin: str = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.Movimiento).options(joinedload(models.Movimiento.producto))

    # Aplicar filtros si el usuario mandó fechas
    if fecha_inicio:
        # Convertimos texto a fecha y filtramos
        fecha_dt = datetime.strptime(fecha_inicio, "%Y-%m-%d")
        query = query.filter(models.Movimiento.fecha_movimiento >= fecha_dt)
    
    if fecha_fin:
        # Sumamos un día a la fecha fin para incluir todo ese día (hasta las 23:59)
        fecha_dt = datetime.strptime(fecha_fin, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(models.Movimiento.fecha_movimiento < fecha_dt)

    # Ordenar del más nuevo al más viejo
    return query.order_by(models.Movimiento.fecha_movimiento.desc()).all()

@app.post("/registrar/")
def registrar_usuario(usuario: UsuarioCreate, db: Session = Depends(get_db)):
    if db.query(models.Usuario).filter(models.Usuario.username == usuario.username).first():
        raise HTTPException(status_code=400, detail="El usuario ya existe")
    
    hashed_password = get_password_hash(usuario.password)
    
    nuevo_usuario = models.Usuario(
        username=usuario.username,
        hashed_password=hashed_password,
        rol="admin"
    )
    db.add(nuevo_usuario)
    db.commit()
    return {"mensaje": f"Usuario {nuevo_usuario.username} creado correctamente"}

# --- Endpoint para LOGIN (CON DEBUGGING) ---
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
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/reportes/valor-inventario")
def obtener_valor_inventario(db: Session = Depends(get_db)):
    valor = db.query(func.sum(models.Producto.stock_actual * models.Producto.precio_compra)).scalar() or 0
    return {"valor_total_almacen": valor}

# --- RUTAS NUEVAS PARA EDITAR Y BORRAR ---

# 1. ACTUALIZAR (PUT)
# Recibe un ID y los datos nuevos. Sobreescribe lo anterior.
@app.put("/productos/{producto_id}", response_model=ProductoResponse)
def actualizar_producto(
    producto_id: int, 
    producto_actualizado: ProductoCreate, 
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user) # 🔒 Solo Admins
):
    # Buscar el producto
    producto_db = db.query(models.Producto).filter(models.Producto.id == producto_id).first()
    
    if not producto_db:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    # Actualizar campos
    producto_db.sku = producto_actualizado.sku
    producto_db.nombre = producto_actualizado.nombre
    producto_db.precio_compra = producto_actualizado.precio_compra
    producto_db.precio_venta = producto_actualizado.precio_venta
    producto_db.stock_actual = producto_actualizado.stock_actual
    producto_db.punto_reorden = producto_actualizado.punto_reorden
    producto_db.descripcion = producto_actualizado.descripcion
    
    db.commit() # Guardar cambios
    db.refresh(producto_db) # Recargar
    return producto_db

# 2. BORRAR (DELETE)
# Recibe solo el ID y lo elimina de la faz de la tierra.
@app.delete("/productos/{producto_id}")
def eliminar_producto(
    producto_id: int, 
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user) # 🔒 Solo Admins
):
    producto_db = db.query(models.Producto).filter(models.Producto.id == producto_id).first()
    
    if not producto_db:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    # Antes de borrar, verificamos si tiene historial (opcional, pero recomendado)
    # Si borras un producto con movimientos, podrías romper el historial.
    # Por ahora, permitiremos borrarlo, pero ten cuidado.
    
    db.delete(producto_db)
    db.commit()
    
    return {"mensaje": f"Producto {producto_id} eliminado correctamente"}


@app.post("/ventas/checkout")
def procesar_venta(
    venta: VentaCreate, 
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    # 1. Validar Stock Total primero (Para que no venda si falta algo)
    for item in venta.items:
        producto = db.query(models.Producto).filter(models.Producto.id == item.producto_id).first()
        if not producto:
            raise HTTPException(status_code=404, detail=f"Producto ID {item.producto_id} no encontrado")
        if producto.stock_actual < item.cantidad:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente para {producto.nombre}")

    # 2. Si todo está bien, registramos los movimientos
    try:
        total_items = 0
        for item in venta.items:
            nuevo_movimiento = models.Movimiento(
                producto_id=item.producto_id,
                tipo_movimiento="SALIDA", # Es una venta
                cantidad=item.cantidad,
                usuario_responsable=venta.usuario_responsable,
                fecha_movimiento=datetime.now()
            )
            db.add(nuevo_movimiento)
            total_items += 1
            
        db.commit() # Guardamos todo de golpe
        return {"mensaje": "Venta exitosa", "items_procesados": total_items}
        
    except Exception as e:
        db.rollback() # Si algo falla, deshacemos todo
        raise HTTPException(status_code=500, detail=str(e))
    

# --- RUTAS DE CONFIGURACIÓN ---

@app.get("/configuracion/")
def obtener_configuracion(db: Session = Depends(get_db)):
    # Buscamos la configuración (siempre será el ID 1)
    config = db.query(models.Configuracion).first()
    
    # Si no existe (es la primera vez), la creamos con valores por defecto
    if not config:
        config = models.Configuracion()
        db.add(config)
        db.commit()
        db.refresh(config)
    
    return config

@app.post("/configuracion/")
def guardar_configuracion(
    datos: ConfiguracionUpdate, 
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user) # Solo admins
):
    config = db.query(models.Configuracion).first()
    
    # Actualizamos los campos
    config.nombre_tienda = datos.nombre_tienda
    config.direccion = datos.direccion
    config.telefono = datos.telefono
    config.mensaje_ticket = datos.mensaje_ticket
    
    db.commit()
    db.refresh(config)
    return {"mensaje": "Configuración guardada", "config": config}


# --- GENERACIÓN DE TICKET PDF ---
@app.post("/ventas/ticket_pdf")
def generar_ticket(
    venta: VentaCreate, 
    db: Session = Depends(get_db)
):
    # 1. Obtener datos de la tienda
    config = db.query(models.Configuracion).first()
    nombre_tienda = config.nombre_tienda if config else "Mi Tienda"
    direccion = config.direccion if config else ""
    mensaje = config.mensaje_ticket if config else "Gracias por su compra"

    # 2. Crear el archivo en memoria (Buffer)
    buffer = BytesIO()
    # Usamos un tamaño de página tipo Ticket (ancho 3 pulgadas, alto variable o A4 recortado)
    # Por simplicidad usaremos tamaño carta pero dibujaremos arriba a la izquierda
    c = canvas.Canvas(buffer, pagesize=letter)
    
    # 3. Dibujar el Encabezado
    c.setFont("Helvetica-Bold", 16)
    c.drawString(100, 750, nombre_tienda) # X, Y (Y empieza desde abajo)
    
    c.setFont("Helvetica", 10)
    c.drawString(100, 735, direccion)
    c.drawString(100, 720, f"Fecha: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    c.drawString(100, 705, f"Atendido por: {venta.usuario_responsable}")
    
    # Línea separadora
    c.line(100, 695, 500, 695)

    # 4. Dibujar los Productos
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
        # Buscamos el nombre y precio real del producto en la BD
        prod = db.query(models.Producto).filter(models.Producto.id == item.producto_id).first()
        if prod:
            subtotal = prod.precio_venta * item.cantidad
            total_venta += subtotal
            
            c.drawString(100, y, str(item.cantidad))
            c.drawString(140, y, prod.nombre[:25]) # Recortar nombre si es muy largo
            c.drawString(350, y, f"${prod.precio_venta:,.2f}")
            c.drawString(430, y, f"${subtotal:,.2f}")
            y -= 15

    # 5. Dibujar Total y Pie de página
    c.line(100, y-5, 500, y-5)
    y -= 25
    c.setFont("Helvetica-Bold", 14)
    c.drawString(350, y, "TOTAL:")
    c.drawString(430, y, f"${total_venta:,.2f}")
    
    y -= 40
    c.setFont("Helvetica-Oblique", 10)
    c.drawString(100, y, mensaje)
    
    # 6. Guardar PDF
    c.showPage()
    c.save()
    
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=ticket.pdf"})

    # --- IMPORTAR PRODUCTOS DESDE EXCEL ---
@app.post("/productos/importar_excel")
async def importar_excel(
    file: UploadFile = File(...), 
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    # 1. Leer el archivo Excel con Pandas
    contents = await file.read()
    df = pd.read_excel(BytesIO(contents))
    
    # 2. Validar que tenga las columnas correctas
    columnas_necesarias = ['sku', 'nombre', 'precio_compra', 'precio_venta', 'stock', 'reorden']
    # Convertimos los nombres de columnas a minúsculas por si acaso
    df.columns = [c.lower() for c in df.columns]
    
    if not all(col in df.columns for col in columnas_necesarias):
        raise HTTPException(status_code=400, detail=f"El Excel debe tener las columnas: {columnas_necesarias}")

    productos_agregados = 0
    productos_actualizados = 0

    # 3. Recorrer cada fila del Excel
    for index, row in df.iterrows():
        sku_buscado = str(row['sku']) # Asegurar que sea texto
        
        # Buscar si ya existe
        producto_existente = db.query(models.Producto).filter(models.Producto.sku == sku_buscado).first()
        
        if producto_existente:
            # ACTUALIZAR (Opcional: Si quieres que el Excel actualice precios/stock)
            producto_existente.nombre = row['nombre']
            producto_existente.precio_compra = row['precio_compra']
            producto_existente.precio_venta = row['precio_venta']
            producto_existente.stock_actual = int(row['stock']) # Pandas a veces lee floats
            producto_existente.punto_reorden = int(row['reorden'])
            productos_actualizados += 1
        else:
            # CREAR NUEVO
            nuevo_prod = models.Producto(
                sku = sku_buscado,
                nombre = row['nombre'],
                precio_compra = row['precio_compra'],
                precio_venta = row['precio_venta'],
                stock_actual = int(row['stock']),
                punto_reorden = int(row['reorden'])
            )
            db.add(nuevo_prod)
            productos_agregados += 1
            
    db.commit()
    return {
        "mensaje": "Proceso completado", 
        "nuevos": productos_agregados, 
        "actualizados": productos_actualizados
    }

# --- EXPORTAR INVENTARIO A EXCEL ---
@app.get("/productos/exportar_excel")
def exportar_excel(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    # 1. Traer todos los productos de la BD
    productos = db.query(models.Producto).all()
    
    # 2. Convertirlos a una lista de diccionarios (formato para Pandas)
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
    
    # 3. Crear el DataFrame
    df = pd.DataFrame(data)
    
    # 4. Guardar en memoria (BytesIO) en vez de disco duro
    output = BytesIO()
    # Usamos 'openpyxl' como motor para escribir xlsx
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name="Inventario")
        
    output.seek(0)
    
    # 5. Enviar el archivo al navegador
    headers = {"Content-Disposition": "attachment; filename=inventario_completo.xlsx"}
    return StreamingResponse(output, headers=headers, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

# --- REPORTE DE CORTE DE CAJA (VENTAS DEL DÍA) ---
# --- REPORTE DE CORTE DE CAJA (CORREGIDO) ---
@app.get("/reportes/corte_dia")
def corte_del_dia(db: Session = Depends(get_db)):
    # 1. Obtener la fecha de hoy
    hoy = date.today()
    
    # 2. Buscar movimientos de SALIDA de HOY
    # 🔧 CORRECCIÓN: Cambiamos .fecha por .fecha_movimiento
    movimientos = db.query(models.Movimiento).filter(
        func.date(models.Movimiento.fecha_movimiento) == hoy,
        models.Movimiento.tipo_movimiento == "SALIDA"
    ).all()
    
    total_dinero = 0
    total_items = 0
    desglose = []

    # 3. Calcular totales
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
                # 🔧 CORRECCIÓN AQUÍ TAMBIÉN:
                "hora": mov.fecha_movimiento.strftime("%H:%M") 
            })
            
    return {
        "fecha": hoy.strftime("%d/%m/%Y"),
        "total_vendido": total_dinero,
        "items_vendidos": total_items,
        "transacciones": len(movimientos),
        "detalle": desglose
    }


# --- BORRAR MOVIMIENTOS ANTIGUOS ---
# --- BORRAR MOVIMIENTOS (PROTEGIDO CON CLAVE) ---
@app.delete("/movimientos/limpiar")
def limpiar_historial(
    fecha_limite: str, 
    clave_admin: str, # <--- 🔒 Nuevo requisito: La llave maestra
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    # 1. DEFINIR LA CLAVE MAESTRA
    # En un sistema real esto iría en variables de entorno o base de datos.
    # Por ahora, la definimos aquí (cámbiala por la que tú quieras).
    CLAVE_SEGURIDAD = "admin2026" 

    # 2. VALIDAR LA CLAVE
    if clave_admin != CLAVE_SEGURIDAD:
        raise HTTPException(status_code=403, detail="⛔ Clave de seguridad incorrecta. Acceso denegado.")

    # 3. SI LA CLAVE ES CORRECTA, PROCEDEMOS
    fecha_dt = datetime.strptime(fecha_limite, "%Y-%m-%d")
    
    registros_borrados = db.query(models.Movimiento).filter(
        models.Movimiento.fecha_movimiento < fecha_dt
    ).delete()
    
    db.commit()
    return {"mensaje": f"✅ Autorización exitosa. Se eliminaron {registros_borrados} movimientos antiguos."}