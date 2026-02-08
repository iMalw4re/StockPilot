// --- CONFIGURACIÓN ---
// ✅ MODO LOCAL (Activo)
// http://localhost:5500
API_URL = "http://127.0.0.1:8000";

// ❌ MODO NUBE (Comentado con //)
//API_URL = "https://stockpilotapp-zhl3.onrender.com";
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

// Función para formatear fechas de forma legible
function formatearFecha(fechaString) {
    if (!fechaString) return "Sin fecha";
    const fecha = new Date(fechaString);
    
    // Configuración para que se vea así: "05/01/2026, 07:03 PM"
    return fecha.toLocaleString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
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

        const contadorCard = document.getElementById('total-productos');
        if (contadorCard) {
            contadorCard.innerText = productos.length; // Pone la cantidad real (ej. 15)
        }
        renderizarGraficos(productos); // Llamamos a la función para graficar
        
        const cuerpoTabla = document.getElementById('tablaProductos');
        cuerpoTabla.innerHTML = ""; // Limpiar tabla

        productos.forEach(prod => {
            let estado = '<span class="ok">Stock</span>';
            if (prod.stock_actual <= prod.punto_reorden) {
                estado = '<span class="alerta">REORDENAR</span>';
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

// --- FUNCIÓN PARA GUARDAR (POST) - VERSIÓN SWEETALERT ---
async function guardarProducto(event) {
    event.preventDefault(); // Evita recarga
    const token = localStorage.getItem("stockpilot_token");

    // 1. Capturar los datos (USANDO TUS IDs EXACTOS)
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
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(nuevoProducto)
        }); 

        if (respuesta.ok) {
            // A) ÉXITO: Cerramos y limpiamos primero
            cerrarModal(); 
            document.getElementById("formProducto").reset(); 
            
            // B) Mostramos la alerta bonita
            Swal.fire({
                title: '¡Producto Guardado!',
                text: 'Se ha registrado correctamente en el sistema.',
                icon: 'success',
                timer: 2000, // Se cierra sola en 2 segundos
                showConfirmButton: false
            });

            // C) Recargamos las tablas
            cargarProductos(); 
            cargarFinanzas();
            
        } else {
            // A) ERROR DEL SERVIDOR
            const errorData = await respuesta.json();
            console.log("Error detallado:", errorData);
            
            // Alerta bonita de error
            Swal.fire({
                title: 'Error',
                text: errorData.detail || "No se pudo guardar el producto",
                icon: 'error'
            });
        }

    } catch (error) {
        // B) ERROR DE CONEXIÓN
        console.error("Error de conexión:", error);
        Swal.fire({
            title: 'Sin Conexión',
            text: 'No se pudo conectar con el servidor.',
            icon: 'error'
        });
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
        titulo.innerText = "Reabastecer Stock";
        titulo.style.color = "#38a169";
        btn.style.backgroundColor = "#38a169";
        btn.innerText = "Registrar Entrada";
    } else {
        titulo.innerText = "Registrar Venta";
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
    // 1. Ocultar TODAS las secciones (¡Aquí estaba el error, faltaba agregar inventario!)
    const secciones = [
        "seccion-dashboard", 
        "seccion-historial", 
        "seccion-caja", 
        "seccion-configuracion", 
        "seccion-inventario" // 👈 ¡ESTE ES EL IMPORTANTE!
    ];
    
    // Apagamos todas las secciones
    secciones.forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.style.display = "none";
        }
    });
    
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
    }else if (seccion === 'caja') {
        // --- NUEVO: Lógica para la Caja ---
        document.getElementById("seccion-caja").style.display = "block";
        cargarProductosPOS(); // 👇 Esta función la crearemos ahora
    }else if (seccion === 'configuracion') {
    document.getElementById("seccion-configuracion").style.display = "block";
    cargarConfiguracion(); // <--- Llamamos a la función para traer los datos
    }else if (seccion === 'inventario') { 
        // <--- 2. LÓGICA NUEVA PARA EL BOTÓN DE INVENTARIO
        const divInv = document.getElementById("seccion-inventario");
        if(divInv) {
            divInv.style.display = "block";
        } else {
            console.error("Falta crear el <div id='seccion-inventario'> en el HTML");
        }
    }
}

// --- CARGAR DATOS DEL HISTORIAL (CORREGIDO) ---
// --- CARGAR HISTORIAL (AHORA CON FILTROS) ---
async function cargarHistorial() {
    const token = localStorage.getItem("stockpilot_token");
    
    // 1. Leer las fechas de los inputs
    const inicio = document.getElementById("filtro_inicio").value;
    const fin = document.getElementById("filtro_fin").value;

    // 2. Construir la URL con parámetros (query params)
    let url = `${API_URL}/movimientos/?`;
    if (inicio) url += `fecha_inicio=${inicio}&`;
    if (fin) url += `fecha_fin=${fin}`;

    try {
        const respuesta = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });
        
        if (respuesta.ok) {
            const movimientos = await respuesta.json();
            const cuerpoTabla = document.getElementById('tablaHistorial');
            cuerpoTabla.innerHTML = ""; 

            if (movimientos.length === 0) {
                cuerpoTabla.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay movimientos en este rango</td></tr>';
                return;
            }

            movimientos.forEach(mov => {
                const fechaRaw = mov.fecha_movimiento || mov.fecha; // Compatibilidad
                const fechaObj = new Date(fechaRaw);
                const fechaTexto = fechaObj.toLocaleString('es-MX');

                const colorTipo = mov.tipo_movimiento === "ENTRADA" ? "green" : "red";
                let celdaProducto = "";
                if (mov.producto) {
                    celdaProducto = `
                        <strong>${mov.producto.nombre}</strong><br>
                        <small style="color: #666;">SKU: ${mov.producto.sku}</small>
                    `;
                } else {
                    celdaProducto = `<span style="color:red;">Producto Eliminado (ID ${mov.producto_id})</span>`;
                }

                cuerpoTabla.innerHTML += `
                    <tr>
                        <td>${fechaTexto}</td>
                        <td>${celdaProducto}</td>  <td style="color: ${colorTipo}; font-weight: bold;">${mov.tipo_movimiento}</td>
                        <td>${mov.cantidad}</td>
                        <td>${mov.usuario_responsable}</td>
                    </tr>`;
            });
        }
    } catch (error) {
        console.error("Error historial:", error);
    }
}

function limpiarFiltros() {
    document.getElementById("filtro_inicio").value = "";
    document.getElementById("filtro_fin").value = "";
    cargarHistorial(); // Cargar todo de nuevo
}

// --- DEPURAR (BORRAR) HISTORIAL ANTIGUO ---
// --- DEPURAR HISTORIAL (VERSIÓN VISUAL PRO) ---
async function depurarHistorial() {
    
    // 1. PRIMERA VENTANA: Pedir la Fecha
    const { value: fechaLimite } = await Swal.fire({
        title: '⚠️ ZONA DE PELIGRO',
        html: 'Esta acción es <b>irreversible</b>.<br>Se borrará todo el historial ANTERIOR a la fecha que elijas.',
        icon: 'warning',
        input: 'date', // Un calendario bonito
        inputLabel: 'Selecciona la Fecha Límite',
        showCancelButton: true,
        confirmButtonColor: '#d33', // Rojo peligro
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Continuar',
        cancelButtonText: 'Cancelar'
    });

    // Si el usuario cancela o no pone fecha, paramos
    if (!fechaLimite) return;

    // 2. SEGUNDA VENTANA: Pedir Contraseña
    const { value: clave } = await Swal.fire({
        title: '🔒 SEGURIDAD REQUERIDA',
        text: `Estás a punto de borrar registros anteriores al ${fechaLimite}. Confirma tu identidad.`,
        input: 'password',
        inputPlaceholder: 'Escribe la clave de administrador',
        inputAttributes: {
            autocapitalize: 'off',
            autocorrect: 'off'
        },
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'BORRAR DEFINITIVAMENTE',
        cancelButtonText: 'Me arrepentí',
        showLoaderOnConfirm: true, // Muestra un circulito cargando mientras borra
        preConfirm: async (passwordIngresada) => {
            // Aquí hacemos la petición al servidor DENTRO de la alerta
            try {
                const token = localStorage.getItem("stockpilot_token");
                const url = `${API_URL}/movimientos/limpiar?fecha_limite=${fechaLimite}&clave_admin=${passwordIngresada}`;
                
                const response = await fetch(url, {
                    method: "DELETE",
                    headers: { "Authorization": `Bearer ${token}` }
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.detail || "Error desconocido");
                }
                
                return data; // Si todo sale bien, pasamos los datos
            } catch (error) {
                Swal.showValidationMessage(`Error: ${error.message}`); // Muestra el error en la misma ventanita
            }
        }
    });

    // 3. RESULTADO FINAL
    if (clave) {
        // Si llegamos aquí es porque la clave fue correcta y se borró
        Swal.fire({
            title: '¡Depurado!',
            text: clave.mensaje, // El mensaje que viene del backend
            icon: 'success'
        });
        cargarHistorial(); // Refrescamos la tabla
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
                backgroundColor: '#610a0bff',
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
    // ... (Aquí arriba está el código de chartStock) ...

    // 4. Configurar Gráfica de GANANCIAS (Líneas Comparativas)
    // Extraemos los datos de precio
    const preciosCompra = topProductos.map(p => p.precio_compra);
    const preciosVenta = topProductos.map(p => p.precio_venta);

    // Contexto del canvas
    const ctxGanancias = document.getElementById('graficaGanancias');

    // Validamos que el elemento exista en el HTML antes de dibujar
    if (ctxGanancias) {
        // Variable global para controlar esta gráfica (agrégala al inicio del archivo si quieres ser muy estricto, o usa window)
        if (window.chartGanancias) window.chartGanancias.destroy();

        window.chartGanancias = new Chart(ctxGanancias.getContext('2d'), {
            type: 'line', // Tipo lineal como pediste
            data: {
                labels: nombres,
                datasets: [
                    {
                        label: 'Precio Venta ($)',
                        data: preciosVenta,
                        borderColor: '#48bb78', // Verde (Ganancia)
                        backgroundColor: 'rgba(72, 187, 120, 0.1)',
                        borderWidth: 3,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#48bb78',
                        pointRadius: 5, // Puntos visibles
                        tension: 0.3, // Curvatura suave
                        fill: true
                    },
                    {
                        label: 'Costo Compra ($)',
                        data: preciosCompra,
                        borderColor: '#e53e3e', // Rojo (Costo)
                        backgroundColor: 'rgba(229, 62, 62, 0.1)',
                        borderWidth: 2,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#e53e3e',
                        pointRadius: 5,
                        borderDash: [5, 5], // Línea punteada para diferenciar mejor
                        tension: 0.3,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            footer: function(tooltipItems) {
                                // Calculamos la ganancia exacta al pasar el mouse
                                const venta = tooltipItems[0].parsed.y;
                                const compra = tooltipItems[1].parsed.y;
                                return 'Ganancia Neta: $' + (venta - compra).toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) { return '$' + value; } // Pone signo de pesos
                        }
                    }
                }
            }
        });
    }
}

// --- LÓGICA DEL PUNTO DE VENTA (POS) ---

let carrito = []; // Aquí guardaremos las cosas antes de vender

function cargarProductosPOS() {
    const cuerpoTabla = document.getElementById('tabla-productos-pos');
    cuerpoTabla.innerHTML = ""; // Limpiar antes de pintar

    // Usamos inventarioGlobal, que ya tiene los datos cargados
    inventarioGlobal.forEach(prod => {
        // Solo mostramos productos con stock positivo (opcional)
        // if (prod.stock_actual > 0) { ... }

        const fila = `
            <tr>
                <td>
                    <strong>${prod.nombre}</strong><br>
                    <small style="color:#888;">${prod.sku}</small>
                </td>
                <td>$${prod.precio_venta}</td>
                <td>${prod.stock_actual}</td>
                <td>
                    <button class="btn-icon" style="background-color: #48bb78; color: white;" 
                            onclick="agregarAlCarrito(${prod.id})">
                        <i class="fas fa-plus"></i>
                    </button>
                </td>
            </tr>
        `;
        cuerpoTabla.innerHTML += fila;
    });
}

function agregarAlCarrito(idProducto) {
    // 1. Buscar el producto en la memoria
    const producto = inventarioGlobal.find(p => p.id === idProducto);
    
    // 2. Revisar si ya está en el carrito para solo sumar cantidad
    const itemEnCarrito = carrito.find(item => item.id === idProducto);

    if (itemEnCarrito) {
        // Si ya está, le sumamos 1, PERO revisamos que no supere el stock real
        if (itemEnCarrito.cantidad < producto.stock_actual) {
            itemEnCarrito.cantidad++;
        } else {
            alert("¡No tienes más stock de este producto!");
            return;
        }
    } else {
        // Si no está, lo agregamos nuevo con cantidad 1
        if (producto.stock_actual > 0) {
            carrito.push({
                id: producto.id,
                sku: producto.sku,
                nombre: producto.nombre,
                precio: producto.precio_venta,
                cantidad: 1
            });
        } else {
            alert("Producto agotado");
            return;
        }
    }

    // 3. Actualizar la vista del ticket
    renderizarCarrito();
}

function renderizarCarrito() {
    const divCarrito = document.getElementById('lista-carrito');
    const spanTotal = document.getElementById('total-carrito');
    divCarrito.innerHTML = ""; // Limpiar

    let total = 0;

    carrito.forEach((item, index) => {
        const subtotal = item.precio * item.cantidad;
        total += subtotal;

        const htmlItem = `
            <div class="item-ticket">
                <div>
                    <strong>${item.nombre}</strong><br>
                    <small>${item.cantidad} x $${item.precio}</small>
                </div>
                <div style="text-align: right;">
                    <strong>$${subtotal}</strong><br>
                    <i class="fas fa-trash" style="color: red; cursor: pointer;" onclick="eliminarDelCarrito(${index})"></i>
                </div>
            </div>
        `;
        divCarrito.innerHTML += htmlItem;
    });

    spanTotal.innerText = `$${total.toLocaleString()}`;
    
    // Si está vacío mostrar mensaje
    if (carrito.length === 0) {
        divCarrito.innerHTML = '<p style="text-align: center; color: #aaa; margin-top: 20px;">El carrito está vacío</p>';
    }
}

function eliminarDelCarrito(index) {
    carrito.splice(index, 1); // Borrar item por su posición
    renderizarCarrito();
}

function limpiarCarrito() {
    carrito = [];
    renderizarCarrito();
}


// --- FINALIZAR COMPRA (CORREGIDO CON SWEETALERT Y PDF) ---
async function finalizarCompra() {
    // Usamos Swal también para el carrito vacío (más bonito)
    if (carrito.length === 0) return Swal.fire('Carrito vacío', 'Agrega productos antes de cobrar', 'warning');

    const token = localStorage.getItem("stockpilot_token");
    
    // 1. Preparamos los datos
    const itemsParaEnviar = carrito.map(item => ({
        producto_id: item.id,
        cantidad: item.cantidad
    }));

    const datosVenta = {
        items: itemsParaEnviar,
        usuario_responsable: "admin" 
    };

    // 2. Enviamos al servidor (Venta)
    try {
        const respuesta = await fetch(`${API_URL}/ventas/checkout`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(datosVenta)
        });

        if (respuesta.ok) {
            // --- ÉXITO ---
            
            // A) Alerta bonita
            Swal.fire({
                title: '¡Venta Exitosa!',
                text: 'Generando ticket PDF...',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });

            // B) PEDIR EL PDF (Esta parte te faltaba)
            try {
                const resTicket = await fetch(`${API_URL}/ventas/ticket_pdf`, {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify(datosVenta)
                });

                if (resTicket.ok) {
                    const blob = await resTicket.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ticket_${new Date().getTime()}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                }
            } catch (errPdf) {
                console.error("Error generando PDF", errPdf);
            }

            // C) Limpiar todo
            limpiarCarrito();
            cargarProductos();
            cargarFinanzas();
            
        } else {
            // --- ERROR DE SERVIDOR ---
            const error = await respuesta.json();
            Swal.fire('Error', error.detail || "No se pudo procesar la venta", 'error');
        }

    } catch (error) {
        // --- ERROR DE RED ---
        console.error(error);
        Swal.fire('Error de conexión', 'No se pudo conectar con el servidor', 'error');
    }
}


// --- LÓGICA DE CONFIGURACIÓN ---

async function cargarConfiguracion() {
    const token = localStorage.getItem("stockpilot_token");
    try {
        const respuesta = await fetch(`${API_URL}/configuracion/`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (respuesta.ok) {
            const config = await respuesta.json();
            // Rellenar el formulario
            document.getElementById("conf_nombre").value = config.nombre_tienda;
            document.getElementById("conf_direccion").value = config.direccion;
            document.getElementById("conf_telefono").value = config.telefono;
            document.getElementById("conf_mensaje").value = config.mensaje_ticket;
            
    
        }
    } catch (error) {
        console.error("Error cargando config:", error);
    }
}

async function guardarConfiguracion(event) {
    event.preventDefault();
    const token = localStorage.getItem("stockpilot_token");

    const datos = {
        nombre_tienda: document.getElementById("conf_nombre").value,
        direccion: document.getElementById("conf_direccion").value,
        telefono: document.getElementById("conf_telefono").value,
        mensaje_ticket: document.getElementById("conf_mensaje").value
    };

    try {
        const respuesta = await fetch(`${API_URL}/configuracion/`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify(datos)
        });

        if (respuesta.ok) {
            alert(" Configuración actualizada correctamente");
            cargarConfiguracion(); // Recargar para ver cambios
        } else {
            alert("Error al guardar");
        }
    } catch (error) {
        alert("Error de conexión");
    }
}

// --- IMPORTAR EXCEL ---
async function subirExcel() {
    const input = document.getElementById('inputExcel');
    if (!input.files[0]) return alert("Selecciona un archivo primero");

    const formData = new FormData();
    formData.append("file", input.files[0]);

    const token = localStorage.getItem("stockpilot_token");

    try {
        // Mostrar indicador de carga (opcional)
        document.body.style.cursor = "wait"; 
        
        const respuesta = await fetch(`${API_URL}/productos/importar_excel`, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${token}` 
                // NO poner Content-Type, el navegador lo pone solo para FormData
            },
            body: formData
        });

        const datos = await respuesta.json();
        
        if (respuesta.ok) {
            alert(`✅ Éxito:\n- Nuevos: ${datos.nuevos}\n- Actualizados: ${datos.actualizados}`);
            input.value = ""; // Limpiar input
        } else {
            alert("❌ Error: " + datos.detail);
        }

    } catch (error) {
        console.error(error);
        alert("Error al subir archivo");
    } finally {
        document.body.style.cursor = "default";
    }
}

// --- EXPORTAR EXCEL ---
async function descargarExcel() {
    const token = localStorage.getItem("stockpilot_token");
    
    try {
        document.body.style.cursor = "wait"; // Poner relojito de espera

        const respuesta = await fetch(`${API_URL}/productos/exportar_excel`, {
            method: "GET",
            headers: { 
                "Authorization": `Bearer ${token}` 
            }
        });

        if (respuesta.ok) {
            // Convertir la respuesta en un archivo descargable (Blob)
            const blob = await respuesta.blob();
            const url = window.URL.createObjectURL(blob);
            
            // Crear enlace invisible y hacer clic
            const a = document.createElement('a');
            a.href = url;
            a.download = `inventario_${new Date().toISOString().slice(0,10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            
        } else {
            alert("❌ Error al descargar el archivo");
        }

    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    } finally {
        document.body.style.cursor = "default"; // Quitar relojito
    }
}


// --- CORTE DE CAJA ---
async function verCorteCaja() {
    const token = localStorage.getItem("stockpilot_token");

    try {
        const respuesta = await fetch(`${API_URL}/reportes/corte_dia`, {
            method: "GET",
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (respuesta.ok) {
            const datos = await respuesta.json();
            
            // Llenar el modal con los datos
            document.getElementById("corteFecha").innerText = datos.fecha;
            document.getElementById("corteTotal").innerText = `$${datos.total_vendido.toLocaleString()}`;
            document.getElementById("corteItems").innerText = datos.items_vendidos;
            document.getElementById("corteTransacciones").innerText = datos.transacciones;
            
            // Mostrar modal
            document.getElementById("modalCorte").style.display = "block";
        } else {
            alert("Error al obtener el corte");
        }

    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    }
}


// --- CORTE DE CAJA ---
async function verCorteCaja() {
    const token = localStorage.getItem("stockpilot_token");

    try {
        const respuesta = await fetch(`${API_URL}/reportes/corte_dia`, {
            method: "GET",
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (respuesta.ok) {
            const datos = await respuesta.json();
            
            // Llenar el modal con los datos
            document.getElementById("corteFecha").innerText = datos.fecha;
            document.getElementById("corteTotal").innerText = `$${datos.total_vendido.toLocaleString()}`;
            document.getElementById("corteItems").innerText = datos.items_vendidos;
            document.getElementById("corteTransacciones").innerText = datos.transacciones;
            
            // Mostrar modal
            document.getElementById("modalCorte").style.display = "block";
        } else {
            alert("Error al obtener el corte");
        }

    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    }
}

// Ejecutar al inicio
cargarFinanzas();
cargarProductos();