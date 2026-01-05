// --- CONFIGURACIÓN ---
// ✅ MODO LOCAL (Activo)
// http://localhost:5500
//const API_URL = "http://127.0.0.1:8000";

// ❌ MODO NUBE (Comentado con //)
API_URL = "https://stockpilot-lhep.onrender.com";
let inventarioGlobal = [];


// --- LÓGICA DE LOGIN ---

async function iniciarSesion(event) {
    event.preventDefault();
    
    const usuario = document.getElementById("login_user").value;
    const pass = document.getElementById("login_pass").value;
    const errorMsg = document.getElementById("errorLogin");

    // Preparamos los datos para enviar (Formato especial x-www-form-urlencoded)
    const formData = new URLSearchParams();
    formData.append("username", usuario);
    formData.append("password", pass);

    try {
        const respuesta = await fetch(`${API_URL}/token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData
        });

        if (respuesta.ok) {
            const data = await respuesta.json();
            
            // 1. Guardar el Token en la memoria del navegador (LocalStorage)
            localStorage.setItem("stockpilot_token", data.access_token);
            
            // 2. Ocultar Login y Mostrar App
            document.getElementById("seccion-login").style.display = "none";
            document.getElementById("app-principal").style.display = "flex"; // O block, según tu css
            
            // 3. Cargar datos
            cargarFinanzas();
            cargarProductos();
            
        } else {
            errorMsg.style.display = "block";
            errorMsg.innerText = "Usuario o contraseña incorrectos";
        }

    } catch (error) {
        console.error(error);
        errorMsg.style.display = "block";
        errorMsg.innerText = "Error de conexión con el servidor";
    }
}

// --- VERIFICAR SI YA ESTOY LOGUEADO AL INICIAR ---
// Esto hace que si recargas la página, no te pida login otra vez si ya tienes token
window.onload = function() {
    const token = localStorage.getItem("stockpilot_token");
    
    if (token) {
        // Ya tiene llave, pásale
        document.getElementById("seccion-login").style.display = "none";
        document.getElementById("app-principal").style.display = "flex";
        cargarFinanzas();
        cargarProductos();
    } else {
        // No tiene llave, muestra login
        document.getElementById("seccion-login").style.display = "flex";
        document.getElementById("app-principal").style.display = "none";
    }
};

// --- FUNCIÓN PARA CERRAR SESIÓN ---
function cerrarSesion() {
    // 1. Borrar el token de la memoria segura
    localStorage.removeItem("stockpilot_token");

    // 2. Ocultar el Dashboard
    document.getElementById("app-principal").style.display = "none";

    // 3. Mostrar el Login
    document.getElementById("seccion-login").style.display = "flex";

    // 4. (Opcional) Limpiar los campos del formulario para que no se queden escritos
    document.getElementById("login_user").value = "";
    document.getElementById("login_pass").value = "";
}

// 1. Cargar Dashboard (Finanzas)
async function cargarFinanzas() {
    const token = localStorage.getItem("stockpilot_token"); // 👈 Recuperar Token
    try {
        const respuesta = await fetch(`${API_URL}/reportes/valor-inventario`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}` // 👈 ¡ESTO FALTABA!
            }
        });

        if (!respuesta.ok) {
             if (respuesta.status === 401) { return; } // Si falla auth, no hacemos nada visual aqui
        }
        const datos = await respuesta.json();
        document.getElementById('valorTotal').innerText = `$${datos.valor_total_almacen.toLocaleString()}`; // .toLocaleString pone las comas de miles
        document.getElementById('totalProductos').innerText = datos.items_contabilizados || 0;
    } catch (error) {
        console.error("Error cargando finanzas:", error);
    }
}

// 2. Cargar Tabla de Productos
// 2. Cargar Tabla de Productos (CON BOTONES NUEVOS)
async function cargarProductos() {
    // 1. Recuperamos la llave del bolsillo
    const token = localStorage.getItem("stockpilot_token");

    try {
        const respuesta = await fetch(`${API_URL}/productos/`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` // 👈 ¡ESTO ES LA LLAVE!
            }
        });

        // (El resto de tu código sigue igual...)
        if (!respuesta.ok) {
             if (respuesta.status === 401) { cerrarSesion(); return; } // Si la llave venció, nos saca
             throw new Error("Error al cargar");
        }
        
        const productos = await respuesta.json();
        inventarioGlobal = productos; // Guardamos en variable global para usar en el escáner

        renderizarGraficos(productos); // Llamamos a la función para graficar
        
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

                        <span style="margin: 0 5px; border-left: 1px solid #ccc;"></span>

                        <button class="btn-icon" style="background-color: #f6ad55; color: white;" onclick="abrirModalEditar(${prod.id})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon" style="background-color: #fc8181; color: white;" onclick="eliminarProducto(${prod.id})" title="Eliminar">
                            <i class="fas fa-trash"></i>
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
    const token = localStorage.getItem("stockpilot_token"); // 👈 Recuperar Token

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
        const respuesta = await fetch(`${API_URL}/productos/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` // 👈 ¡ESTO FALTABA!
            },
            body: JSON.stringify(nuevoProducto)
        }); 

        if (respuesta.ok) {
            alert("Producto guardado con éxito");
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

    // 1. Recuperar Token
    const token = localStorage.getItem("stockpilot_token");

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
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` // 👈 ¡ESTO FALTABA!
            },
            body: JSON.stringify(datosMovimiento)
        });

        if (respuesta.ok) {
            alert(` Movimiento registrado con éxito`);
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
    const token = localStorage.getItem("stockpilot_token"); // 👈 Recuperar Token
    try {
        const respuesta = await fetch(`${API_URL}/movimientos/`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` // 👈 ¡ESTO FALTABA!
            }
        });
        
        if (!respuesta.ok) {
             if (respuesta.status === 401) { cerrarSesion(); return; }
             throw new Error("Error al cargar historial");
        }

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


// --- LÓGICA DEL ESCÁNER ---

let html5QrcodeScanner = null; // Variable para controlar la cámara

function iniciarEscaner() {
    // 1. Mostrar el modal
    document.getElementById("modalEscaner").style.display = "block";

    // 2. Configuración del lector
    // Si ya existe una instancia, no la creamos de nuevo
    if (html5QrcodeScanner === null) {
        html5QrcodeScanner = new Html5Qrcode("reader");
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    // 3. Encender cámara (Pide permiso al usuario)
    html5QrcodeScanner.start(
        { facingMode: "environment" }, // Usa la cámara trasera
        config,
        onScanSuccess, // Función si lee bien
        onScanFailure  // Función si falla (opcional)
    ).catch(err => {
        console.error("Error al iniciar cámara:", err);
        alert("No se pudo iniciar la cámara. Verifica los permisos.");
    });
}

// Qué pasa cuando lee un código
function onScanSuccess(decodedText, decodedResult) {
    // 1. Detener escáner y cerrar modal
    detenerEscaner();
    
    console.log(`Código escaneado: ${decodedText}`);

    // 2. Buscar si el producto existe en nuestra memoria
    // (Buscamos que el SKU coincida con lo escaneado)
    const productoEncontrado = inventarioGlobal.find(p => p.sku === decodedText);

    if (productoEncontrado) {
        // --- CASO A: ¡ENCONTRADO! ---
        // Reproducir sonido de "Beep" (Opcional, pero satisfactorio)
        // const audio = new Audio('beep.mp3'); audio.play();

        // Preguntar o asumir acción. Por defecto: Abrimos ventana de VENTA (Salida)
        // Pasamos el ID, el SKU y 'salida'
        abrirModalMovimiento(productoEncontrado.id, productoEncontrado.sku, 'salida');
        
        // Un pequeño aviso visual
        alert(` Producto encontrado: ${productoEncontrado.nombre}\nListo para vender.`);

    } else {
        // --- CASO B: NO EXISTE ---
        const crearNuevo = confirm(` El producto con código ${decodedText} no existe.\n\n¿Quieres registrarlo ahora?`);
        
        if (crearNuevo) {
            abrirModal(); // Abrir formulario de creación
            // Rellenar el SKU automáticamente para ahorrar tiempo
            document.getElementById("sku").value = decodedText;
            document.getElementById("nombre").focus(); // Poner el cursor en el nombre
        }
    }
}

function onScanFailure(error) {
    // No hacer nada para no llenar la consola de errores mientras busca
    // console.warn(`Code scan error = ${error}`);
}

function detenerEscaner() {
    document.getElementById("modalEscaner").style.display = "none";
    
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            console.log("Cámara detenida.");
        }).catch(err => {
            console.error("Error al detener cámara:", err);
        });
    }
}

// --- FUNCIÓN PARA ELIMINAR PRODUCTO ---
async function eliminarProducto(id) {
    if (!confirm("¿Estás seguro de que quieres eliminar este producto?\nEsta acción no se puede deshacer.")) {
        return; // Si dice "Cancelar", no hacemos nada
    }

    const token = localStorage.getItem("stockpilot_token");

    try {
        const respuesta = await fetch(`${API_URL}/productos/${id}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (respuesta.ok) {
            alert("Producto eliminado correctamente");
            cargarProductos(); // Recargar tabla
            cargarFinanzas();  // Recargar dinero
        } else {
            if (respuesta.status === 401) { cerrarSesion(); return; }
            alert("No se pudo eliminar el producto.");
        }
    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    }
}

// --- FUNCIONES DE EDICIÓN ---

function abrirModalEditar(id) {
    // 1. Buscar el producto en nuestra memoria global
    const producto = inventarioGlobal.find(p => p.id === id);
    
    if (producto) {
        // 2. Rellenar el formulario con los datos actuales
        document.getElementById("edit_id").value = producto.id;
        document.getElementById("edit_sku").value = producto.sku;
        document.getElementById("edit_nombre").value = producto.nombre;
        document.getElementById("edit_precio_compra").value = producto.precio_compra;
        document.getElementById("edit_precio_venta").value = producto.precio_venta;
        document.getElementById("edit_stock_actual").value = producto.stock_actual;
        document.getElementById("edit_punto_reorden").value = producto.punto_reorden;

        // 3. Mostrar la ventana
        document.getElementById("modalEditar").style.display = "block";
    }
}

async function guardarEdicion(event) {
    event.preventDefault();
    
    const id = document.getElementById("edit_id").value;
    const token = localStorage.getItem("stockpilot_token");

    const datosActualizados = {
        sku: document.getElementById("edit_sku").value,
        nombre: document.getElementById("edit_nombre").value,
        precio_compra: parseFloat(document.getElementById("edit_precio_compra").value),
        precio_venta: parseFloat(document.getElementById("edit_precio_venta").value),
        stock_actual: parseInt(document.getElementById("edit_stock_actual").value),
        punto_reorden: parseInt(document.getElementById("edit_punto_reorden").value),
        descripcion: "Actualizado desde Web"
    };

    try {
        const respuesta = await fetch(`${API_URL}/productos/${id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(datosActualizados)
        });

        if (respuesta.ok) {
            alert("Cambios guardados exitosamente");
            document.getElementById("modalEditar").style.display = "none";
            cargarProductos(); // Refrescar tabla
            cargarFinanzas();
        } else {
            if (respuesta.status === 401) { cerrarSesion(); return; }
            alert("Error al actualizar");
        }
    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    }
}


// --- LÓGICA DE GRÁFICAS (Chart.js) ---

let chartValor = null; // Variables globales para poder destruir y redibujar
let chartStock = null;

function renderizarGraficos(productos) {
    // 1. Preparar los datos
    // Tomamos solo los primeros 10 productos para que la gráfica no se vea fea si hay 1000
    const topProductos = productos.slice(0, 10); 
    
    const nombres = topProductos.map(p => p.nombre); // Usamos SKU o Nombre como etiqueta
    const stocks = topProductos.map(p => p.stock_actual);
    // Calculamos cuánto dinero vale cada producto (Stock * Precio Compra)
    const valores = topProductos.map(p => p.stock_actual * p.precio_compra);

    // 2. Configurar Gráfica de VALOR (Pastel / Doughnut)
    const ctxValor = document.getElementById('graficaValor').getContext('2d');
    
    // Si ya existe, la destruimos para crear la nueva (evita bugs visuales)
    if (chartValor) chartValor.destroy();

    chartValor = new Chart(ctxValor, {
        type: 'doughnut',
        data: {
            labels: nombres,
            datasets: [{
                label: 'Valor ($)',
                data: valores,
                backgroundColor: [
                    '#76e4f7', '#48bb78', '#f6ad55', '#f56565', '#9f7aea',
                    '#ed64a6', '#ecc94b', '#667eea', '#a33249ff', '#feb2b2'
                ],
                borderWidth: 1
            }]
        },
        options: { 
            responsive: true,
            maintainAspectRatio: false, // 👈 ¡ESTA ES LA MAGIA!
            plugins: {
                legend: { position: 'right' } // Pone la leyenda al lado para ahorrar altura
            }
        }
    });

    // 3. Configurar Gráfica de STOCK (Barras)
    const ctxStock = document.getElementById('graficaStock').getContext('2d');
    
    if (chartStock) chartStock.destroy();

    chartStock = new Chart(ctxStock, {
        type: 'bar',
        data: {
            labels: nombres,
            datasets: [{
                label: 'Unidades en Stock',
                data: stocks,
                backgroundColor: '#3dc4c6ff',
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // 👈 ¡ESTA ES LA MAGIA!
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Ejecutar al inicio
cargarFinanzas();
cargarProductos();