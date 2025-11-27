// --- JAVASCRIPT (La Lógica del Frontend) ---
const API_URL = "https://stockpilot-lhep.onrender.com";

// Función 1: Cargar el Dashboard Financiero
async function cargarFinanzas() {
    const respuesta = await fetch(`${API_URL}/reportes/valor-inventario`);
    const datos = await respuesta.json();
            
    document.getElementById('valorTotal').innerText = `$${datos.valor_total_almacen}`;
    document.getElementById('totalProductos').innerText = datos.items_contabilizados;
    }

        // Función 2: Cargar la Tabla de Productos
        async function cargarProductos() {
            const respuesta = await fetch(`${API_URL}/productos/`);
            const productos = await respuesta.json();
            
            const cuerpoTabla = document.getElementById('tablaProductos');
            cuerpoTabla.innerHTML = ""; // Limpiar tabla antes de llenar

            productos.forEach(prod => {
                // Lógica visual: Si stock <= reorden, mostramos ALERTA
                let estado = '<span class="ok">Normal</span>';
                if (prod.stock_actual <= prod.punto_reorden) {
                    estado = '<span class="alerta">⚠️ REORDENAR</span>';
                }

                // Insertar fila en la tabla
                const fila = `
                    <tr>
                        <td>${prod.sku}</td>
                        <td>${prod.nombre}</td>
                        <td>${prod.stock_actual}</td>
                        <td>${estado}</td>
                        <td>$${prod.precio_venta}</td>
                    </tr>
                `;
                cuerpoTabla.innerHTML += fila;
            });
        }

        // Ejecutar al cargar la página
        cargarFinanzas();
        cargarProductos();