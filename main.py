from sqlalchemy import func
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware # <--- 1. IMPORTAR ESTO
from sqlalchemy.orm import Session
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel # Para validar datos que entran (Schemas)
from typing import List, Optional
from sqlalchemy import func # Función especial de SQL llamada func que nos permite hacer sumas matemáticas

# Importamos lo que creaste antes
import models
import database

# 1. Crear las tablas automáticamente si no existen
# (Aunque ya las creaste en SQL, esto asegura que Python las reconozca)
models.Base.metadata.create_all(bind=database.engine)

# 2. INICIALIZAR LA APP (UNA SOLA VEZ)
app = FastAPI()

# --- 2. CONFIGURACIÓN DE SEGURIDAD (CORS) ---
# Esto permite que tu HTML local se conecte con tu Python
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- SCHEMAS (Validadores de datos) ---
# Esto sirve para que si alguien manda texto en vez de número, la API de error automático.
class ProductoBase(BaseModel):
    sku: str
    nombre: str
    precio_compra: float
    precio_venta: float
    stock_actual: int
    punto_reorden: int

class ProductoCreate(ProductoBase):
    pass

class ProductoResponse(ProductoBase):
    id: int
    class Config:
        orm_mode = True # Permite leer datos directo del modelo SQL

# --- Schemas para Movimientos ---
class MovimientoCreate(BaseModel):
    producto_id: int
    tipo_movimiento: str # "ENTRADA" o "SALIDA"
    cantidad: int
    usuario_responsable: str

# --- RUTAS (ENDPOINTS) ---

# Ruta para CREAR un producto (POST)
@app.post("/productos/", response_model=ProductoResponse)
def crear_producto(producto: ProductoCreate, db: Session = Depends(database.get_db)):
    # Verificamos si ya existe el SKU
    db_producto = db.query(models.Producto).filter(models.Producto.sku == producto.sku).first()
    if db_producto:
        raise HTTPException(status_code=400, detail="El SKU ya existe")
    
    # Creamos el objeto del modelo SQL
    nuevo_producto = models.Producto(
        sku=producto.sku,
        nombre=producto.nombre,
        precio_compra=producto.precio_compra,
        precio_venta=producto.precio_venta,
        stock_actual=producto.stock_actual,
        punto_reorden=producto.punto_reorden
    )
    
    # Guardamos en la Base de Datos
    db.add(nuevo_producto)
    db.commit()
    db.refresh(nuevo_producto)
    return nuevo_producto

# Ruta para LEER todos los productos (GET)
@app.get("/productos/", response_model=List[ProductoResponse])
def leer_productos(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    productos = db.query(models.Producto).offset(skip).limit(limit).all()
    return productos


# Ruta para registrar un MOVIMIENTO (Entrada/Salida)
@app.post("/movimientos/")
def registrar_movimiento(movimiento: MovimientoCreate, db: Session = Depends(database.get_db)):
    # 1. Verificar si el producto existe
    db_producto = db.query(models.Producto).filter(models.Producto.id == movimiento.producto_id).first()
    if not db_producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # 2. Crear el movimiento
    nuevo_movimiento = models.Movimiento(
        producto_id=movimiento.producto_id,
        tipo_movimiento=movimiento.tipo_movimiento,
        cantidad=movimiento.cantidad,
        usuario_responsable=movimiento.usuario_responsable
        # Nota: Omitimos ubicacion_id por ahora para probar rápido
    )
    
    # 3. Guardar (Aquí el TRIGGER de SQL se disparará solo y actualizará el stock)
    try:
        db.add(nuevo_movimiento)
        db.commit()
        db.refresh(nuevo_movimiento)
        return {"mensaje": "Movimiento registrado con éxito", "id_movimiento": nuevo_movimiento.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# --- RUTAS DE LOGÍSTICA ---

@app.get("/logistica/alertas-reorden", response_model=List[ProductoResponse])
def obtener_alertas_reorden(db: Session = Depends(database.get_db)):
    # Buscamos productos donde el stock actual sea MENOR o IGUAL al punto mínimo definido
    productos_bajos_stock = db.query(models.Producto).filter(
        models.Producto.stock_actual <= models.Producto.punto_reorden
    ).all()
    
    return productos_bajos_stock

# --- Agrega esto AL FINAL del archivo main.py ---
@app.get("/reportes/valor-inventario")
def obtener_valor_inventario(db: Session = Depends(database.get_db)):
    valor_total = db.query(func.sum(models.Producto.stock_actual * models.Producto.precio_compra)).scalar()
    
    if valor_total is None:
        valor_total = 0
        
    return {
        "mensaje": "Reporte financiero generado",
        "moneda": "MXN",
        "valor_total_almacen": valor_total,
        "items_contabilizados": db.query(models.Producto).count()
    }