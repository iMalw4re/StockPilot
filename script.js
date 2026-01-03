// --- CONFIGURACIÓN ---
// const API_URL = "http://127.0.0.1:8000";
const API_URL = "https://stockpilot-lhep.onrender.com";

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
            const errorData = await respuesta.json();
            alert("Error: " + errorData.detail);
        }

    } catch (error) {
        console.error("Error de conexión:", error);
        alert("No se pudo conectar con el servidor.");
    }
}

// Ejecutar al inicio
cargarFinanzas();
cargarProductos();