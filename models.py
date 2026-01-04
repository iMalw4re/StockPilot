from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DECIMAL, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base # Importamos la configuración del archivo anterior

# 1. Modelo Proveedor (Espejo de tabla 'proveedores')
class Proveedor(Base):
    __tablename__ = "proveedores"

    id = Column(Integer, primary_key=True, index=True)
    nombre_empresa = Column(String, nullable=False)
    contacto_nombre = Column(String)
    telefono = Column(String)
    email = Column(String)
    tiempo_entrega_dias = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relación: Un proveedor tiene muchos productos
    productos = relationship("Producto", back_populates="proveedor")

# 2. Modelo Ubicacion (Espejo de tabla 'ubicaciones')
class Ubicacion(Base):
    __tablename__ = "ubicaciones"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    codigo = Column(String, unique=True, nullable=False)
    capacidad_maxima = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# 3. Modelo Producto (Espejo de tabla 'productos')
class Producto(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String, unique=True, index=True, nullable=False)
    nombre = Column(String, index=True, nullable=False)
    descripcion = Column(Text)
    # Usamos DECIMAL para dinero (igual que en tu SQL)
    precio_compra = Column(DECIMAL(10, 2), nullable=False)
    precio_venta = Column(DECIMAL(10, 2), nullable=False)
    stock_actual = Column(Integer, default=0)
    punto_reorden = Column(Integer, default=10)
    # Llave foránea (conexión con proveedores)
    proveedor_default_id = Column(Integer, ForeignKey("proveedores.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Relaciones
    proveedor = relationship("Proveedor", back_populates="productos")
    # Relación con movimientos
    movimientos = relationship("Movimiento", back_populates="producto")

# 4. Modelo Movimiento (Espejo de tabla 'movimientos')
class Movimiento(Base):
    __tablename__ = "movimientos"

    id = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    ubicacion_id = Column(Integer, ForeignKey("ubicaciones.id"))
    
    tipo_movimiento = Column(String, nullable=False) # ENTRADA, SALIDA...
    cantidad = Column(Integer, nullable=False)
    
    fecha_movimiento = Column(DateTime(timezone=True), server_default=func.now())
    usuario_responsable = Column(String)
    notas = Column(Text)

    # Relaciones
    producto = relationship("Producto", back_populates="movimientos")

# --- 5. NUEVA CLASE USUARIO (LO QUE AGREGAMOS HOY) ---
class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    rol = Column(String, default="empleado")