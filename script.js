// --- CONFIGURACIÓN ---
// ✅ MODO LOCAL (Activo)
// const API_URL = "http://127.0.0.1:8000";

// ❌ MODO NUBE (Comentado con //)
API_URL = "https://stockpilot-lhep.onrender.com";

// 1. Cargar Dashboard (Finanzas)
async function cargarFinanzas() {
    try {
        const respuesta = await fetch(`${API_URL}/reportes/valor-inventario`);
        const datos = await respuesta.json();
        document.getElementById('valorTotal').innerText = `$${datos.valor_total_almacen.toLocaleString()}`; // .toLocaleString pone las comas de miles
        document.getElementById('totalProductos').innerText = datos.items_contabilizados;
    } catch (error) {
        console.error("Error cargando finanzas:", error);
    }
}

// 2. Cargar Tabla de Productos
// 2. Cargar Tabla de Productos (CON BOTONES NUEVOS)
async function cargarProductos() {
    try {
        const respuesta = await fetch(`${API_URL}/productos/`);
        const productos = await respuesta.json();
        
        const cuerpoTabla = document.getElementById('tablaProductos');
        cuerpoTabla.innerHTML = ""; // Limpiar tabla

        productos.forEach(prod => {
            let estado = '<span class="ok">Normal</span>';
            if (prod.stock_actual <= prod.punto_reorden) {
                estado = '<span class="alerta"><i class="fas fa-exclamation-triangle"></i> REORDENAR</span>';
            }

            const fila = `
                <tr>
                    <td><strong>${prod.sku}</strong></td>
                    <td>${prod.nombre}</td>
                    <td>${prod.stock_actual}</td>
                    <td>${estado}</td>
                    <td>$${prod.precio_venta.toLocaleString()}</td>
                    <td>
                        <button class="btn-icon btn-vender" onclick="abrirModalMovimiento(${prod.id}, '${prod.sku}', 'salida')" title="Vender">
                            <i class="fas fa-minus"></i>
                        </button>
                        <button class="btn-icon btn-comprar" onclick="abrirModalMovimiento(${prod.id}, '${prod.sku}', 'entrada')" title="Reabastecer">
                            <i class="fas fa-plus"></i>
                        </button>
                    </td>
                </tr>
            `;
            cuerpoTabla.innerHTML += fila;
        });
    } catch (error) {
        console.error("Error cargando productos:", error);
    }
}

// --- FUNCIONES DEL MODAL (VENTANA EMERGENTE) ---

function abrirModal() {
    document.getElementById("modalProducto").style.display = "block";
}

function cerrarModal() {
    document.getElementById("modalProducto").style.display = "none";
}

// Cerrar si hacen clic fuera de la ventanita
window.onclick = function(event) {
    const modal = document.getElementById("modalProducto");
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

// --- FUNCIÓN PARA GUARDAR (POST) ---
async function guardarProducto(event) {
    event.preventDefault(); // Evita que la página se recargue sola

    // 1. Capturar los datos del formulario
    const nuevoProducto = {
        sku: document.getElementById("sku").value,
        nombre: document.getElementById("nombre").value,
        precio_compra: parseFloat(document.getElementById("precio_compra").value),
        precio_venta: parseFloat(document.getElementById("precio_venta").value),
        stock_actual: parseInt(document.getElementById("stock_actual").value),
        punto_reorden: parseInt(document.getElementById("punto_reorden").value)
    };

    try {
        // 2. Enviar a Python (Backend)
        const respuesta = await fetch(`${API_URL}/productos/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(nuevoProducto)
        });

        if (respuesta.ok) {
            alert("¡Producto guardado con éxito! 🎉");
            cerrarModal();
            document.getElementById("formProducto").reset(); // Limpiar formulario
            cargarProductos(); // Recargar tabla automáticamente
            cargarFinanzas();  // Recargar dinero automáticamente
        } else {
            // CAMBIAMOS ESTO PARA LEER EL ERROR REAL
            const errorData = await respuesta.json();
            console.log("Error detallado:", errorData); // Para verlo en consola F12
            alert("Error del Servidor: " + JSON.stringify(errorData, null, 2)); 
        }

    } catch (error) {
        console.error("Error de conexión:", error);
        alert("No se pudo conectar con el servidor.");
    }
}

// --- FUNCIONES PARA MOVIMIENTOS (COMPRAR / VENDER) ---

function abrirModalMovimiento(id, sku, tipo) {
    // 1. Guardamos el ID numérico que pide el backend
    document.getElementById("mov_id").value = id; 
    document.getElementById("mov_sku").value = sku;
    document.getElementById("mov_tipo").value = tipo;

    // Configuración visual (igual que antes)
    const modal = document.getElementById("modalMovimiento");
    const titulo = document.getElementById("tituloMovimiento");
    const btn = document.getElementById("btnMovimiento");
    const subtitulo = document.getElementById("subtituloMovimiento");

    if (tipo === 'entrada') {
        titulo.innerText = "📥 Reabastecer Stock";
        titulo.style.color = "#38a169";
        btn.style.backgroundColor = "#38a169";
        btn.innerText = "Registrar Entrada";
    } else {
        titulo.innerText = "📤 Registrar Venta";
        titulo.style.color = "#e53e3e";
        btn.style.backgroundColor = "#e53e3e";
        btn.innerText = "Registrar Salida";
    }
    
    subtitulo.innerText = `Producto: ${sku}`;
    modal.style.display = "block";
    document.getElementById("mov_cantidad").focus();
}

function cerrarModalMovimiento() {
    document.getElementById("modalMovimiento").style.display = "none";
    document.getElementById("mov_cantidad").value = "";
}

async function guardarMovimiento(event) {
    event.preventDefault();

    // 2. Construimos el objeto EXACTO como lo pide tu main.py
    const datosMovimiento = {
        producto_id: parseInt(document.getElementById("mov_id").value), // Pide int
        tipo_movimiento: document.getElementById("mov_tipo").value.toUpperCase(), // Pide "ENTRADA" (Mayúsculas)
        cantidad: parseInt(document.getElementById("mov_cantidad").value),
        usuario_responsable: "admin" // Pide string (Hardcodeamos "admin" por ahora)
    };

    try {
        const respuesta = await fetch(`${API_URL}/movimientos/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(datosMovimiento)
        });

        if (respuesta.ok) {
            alert(`✅ Movimiento registrado con éxito`);
            cerrarModalMovimiento();
            cargarProductos(); // Recarga la tabla para ver el nuevo stock
            cargarFinanzas();
        } else {
            const errorData = await respuesta.json();
            console.log("Error:", errorData);
            alert("Error: " + JSON.stringify(errorData, null, 2));
        }
    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    }
}

// --- NAVEGACIÓN (CAMBIAR PESTAÑAS) ---
function mostrarSeccion(seccion) {
    // 1. Ocultamos todo
    document.getElementById("seccion-dashboard").style.display = "none";
    document.getElementById("seccion-historial").style.display = "none";
    
    // 2. Quitamos la clase 'active' del menú lateral
    document.querySelectorAll(".sidebar li").forEach(li => li.classList.remove("active"));

    // 3. Mostramos la elegida
    if (seccion === 'dashboard') {
        document.getElementById("seccion-dashboard").style.display = "block";
        // Aquí podrías poner lógica para resaltar el botón del menú
        cargarProductos(); // Recargamos datos por si acaso
    } else if (seccion === 'historial') {
        document.getElementById("seccion-historial").style.display = "block";
        cargarHistorial(); // Vamos a buscar los datos a Python
    }
}

// --- CARGAR DATOS DEL HISTORIAL ---
async function cargarHistorial() {
    try {
        const respuesta = await fetch(`${API_URL}/movimientos/`);
        const movimientos = await respuesta.json();
        
        const cuerpoTabla = document.getElementById('tablaHistorial');
        cuerpoTabla.innerHTML = ""; // Limpiar

        movimientos.forEach(mov => {
            // Formatear fecha bonita
            const fecha = new Date(mov.fecha).toLocaleString();
            
            // Colores según tipo
            const colorTipo = mov.tipo_movimiento === "ENTRADA" ? "green" : "red";
            const icono = mov.tipo_movimiento === "ENTRADA" ? "📥" : "📤";

            // NOTA: Si mov.producto es null, ponemos "Producto Borrado"
            const nombreProd = mov.producto ? mov.producto.nombre : "Producto Desconocido (ID " + mov.producto_id + ")";

            const fila = `
                <tr>
                    <td>${fecha}</td>
                    <td><strong>${nombreProd}</strong></td>
                    <td style="color: ${colorTipo}; font-weight: bold;">
                        ${icono} ${mov.tipo_movimiento}
                    </td>
                    <td>${mov.cantidad}</td>
                    <td>${mov.usuario_responsable}</td>
                </tr>
            `;
            cuerpoTabla.innerHTML += fila;
        });

    } catch (error) {
        console.error("Error historial:", error);
    }
}

// Ejecutar al inicio
cargarFinanzas();
cargarProductos();