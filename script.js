// --- CONFIGURACIÓN ---

// ❌ MODO LOCAL (Debe estar comentado con //)
// API_URL = "http://127.0.0.1:8000";

// ✅ MODO NUBE (Esta es la que debe estar activa)
// Usa TU enlace de Render (el que sale en la barra de tu celular)
API_URL = "https://stockpilotapp-zhl3.onrender.com";
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
            localStorage.setItem("stockpilot_rol", data.rol);
            
            // 2. Ocultar Login y Mostrar App
            document.getElementById("seccion-login").style.display = "none";
            document.getElementById("app-principal").style.display = "flex"; // O block, según tu css

            // Verificar permisos
            verificarPermisosAdmin();
            
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
        verificarPermisosAdmin(); // 👈 Verificar permisos al recargar
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

function verificarPermisosAdmin() {
    const rol = localStorage.getItem("stockpilot_rol");
    
    // Ahora sí los encontrará porque agregamos los IDs en el HTML
    const botonConfig = document.getElementById("link-config");
    const botonUsuarios = document.getElementById("link-usuarios");
    const btnFinanzas = document.getElementById("link-finanzas"); 
    const botonDepurar = document.querySelector("button[onclick='depurarHistorial()']");

    if (rol === "admin") {
        // ADMIN: Muestra todo
        if (botonConfig) botonConfig.style.display = "block"; // O 'list-item'
        if (botonUsuarios) botonUsuarios.style.display = "block";
        if (botonFinanzas) botonFinanzas.style.display = "block";
        if (botonFinanzas) botonFinanzas.style.display = "none";
        if (botonDepurar) botonDepurar.style.display = "block";
    } else {
        // CAJERO: Oculta
        if (botonConfig) botonConfig.style.display = "none";
        if (botonUsuarios) botonUsuarios.style.display = "none";
        if (botonDepurar) botonDepurar.style.display = "none";
    }
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
// 1. Cargar Dashboard (Finanzas)
// 1. Cargar Dashboard (Finanzas) - VERSIÓN CORREGIDA
async function cargarFinanzas() {
    const token = localStorage.getItem("stockpilot_token");
    if (!token) return; // Si no hay token, no intentamos nada (Evita error 401 extra)

    try {
        const respuesta = await fetch(`${API_URL}/reportes/valor-inventario`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!respuesta.ok) {
             if (respuesta.status === 401) return; // Si falló la auth, salimos silenciosamente
        }

        const datos = await respuesta.json();

        // --- AQUÍ ESTÁ LA CORRECCIÓN DE LOS IDs ---
        
        // ID: valorTotal (Coincide con tu HTML)
        const elValor = document.getElementById('valorTotal');
        if (elValor) {
            elValor.innerText = `$${datos.valor_total_almacen.toLocaleString()}`;
        }

        // ID: total-productos (TU HTML TIENE UN GUION, AQUÍ LO PONEMOS IGUAL)
        const elTotal = document.getElementById('total-productos'); 
        if (elTotal) {
            elTotal.innerText = datos.items_contabilizados || 0;
        }

    } catch (error) {
        console.error("Error cargando finanzas:", error);
    }
}
// 2. Cargar Tabla de Productos
// 2. Cargar Tabla de Productos (VERSIÓN PRO FUSIONADA)
async function cargarProductos() {
    const token = localStorage.getItem("stockpilot_token");
    const tabla = document.getElementById("tablaProductos");
    
    // Elementos del Dashboard (Tarjetas)
    const elTotalProd = document.getElementById("total-productos");
    const elTotalDinero = document.getElementById("total-dinero"); 
    const elValorTotalHeader = document.getElementById("valorTotal"); // Por si tienes el otro header también

    try {
        const respuesta = await fetch(`${API_URL}/productos/`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        if (!respuesta.ok) {
             if (respuesta.status === 401) { cerrarSesion(); return; }
             throw new Error("Error al cargar");
        }
        
        const productos = await respuesta.json();
        window.inventarioGlobal = productos; // Guardamos para el escáner

        // --- 💰 CÁLCULOS FINANCIEROS (LO NUEVO) ---
        let sumaStock = 0;
        let sumaDinero = 0;

        productos.forEach(p => {
            sumaStock += p.stock_actual;
            // Calculamos valor de venta total
            sumaDinero += (p.stock_actual * p.precio_venta);
        });

        // Actualizamos Tarjetas del Dashboard
        if (elTotalProd) elTotalProd.innerText = sumaStock; // Suma real de items
        
        // Formateamos el dinero bonito ($1,500.00)
        const dineroFormateado = "$" + sumaDinero.toLocaleString('es-MX', {minimumFractionDigits: 2});
        if (elTotalDinero) elTotalDinero.innerText = dineroFormateado;
        if (elValorTotalHeader) elValorTotalHeader.innerText = dineroFormateado;

        // --- 📊 GRÁFICOS (TU LÓGICA) ---
        if(typeof renderizarGraficos === 'function') {
            renderizarGraficos(productos); 
        }
        
        // --- 📝 TABLA (TUS BOTONES) ---
        if (tabla) {
            tabla.innerHTML = ""; // Limpiar tabla

            productos.forEach(prod => {
                let estado = '<span class="ok" style="color:green; font-weight:bold;">Stock OK</span>';
                if (prod.stock_actual <= prod.punto_reorden) {
                    estado = `<span class="alerta" style="color:red; font-weight:bold;">⚠️ BAJO (${prod.punto_reorden})</span>`;
                }

                const fila = `
                    <tr>
                        <td><strong>${prod.sku}</strong></td>
                        <td>${prod.nombre}</td>
                        <td>${prod.stock_actual}</td>
                        <td>${estado}</td>
                        <td>$${prod.precio_venta.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                        <td>
                            <button class="btn-icon btn-vender" onclick="abrirModalMovimiento(${prod.id}, '${prod.sku}', 'salida')" title="Vender (-)">
                                <i class="fas fa-minus"></i>
                            </button>
                            <button class="btn-icon btn-comprar" onclick="abrirModalMovimiento(${prod.id}, '${prod.sku}', 'entrada')" title="Reabastecer (+)">
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
                tabla.innerHTML += fila;
            });
        }

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
    // 1. Lista de todos los IDs de las secciones
    const secciones = [
        "seccion-dashboard", 
        "seccion-historial", 
        "seccion-caja", 
        "seccion-configuracion", 
        "seccion-inventario",
        "seccion-usuarios",
        "seccion-finanzas" // ✅ Agregado correctamente
    ];
    
    // 2. Primero OCULTAMOS TODAS (Reseteo)
    secciones.forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.style.display = "none";
        }
    });

    // 3. Quitamos la clase 'active' del menú lateral (Visual)
    document.querySelectorAll(".sidebar li").forEach(li => li.classList.remove("active"));

    // 4. Mostramos SOLO la elegida (Lógica de encendido)
    if (seccion === 'dashboard') {
        document.getElementById("seccion-dashboard").style.display = "block";
        cargarProductos(); 

    } else if (seccion === 'historial') {
        document.getElementById("seccion-historial").style.display = "block";
        cargarHistorial(); 

    } else if (seccion === 'caja') {
        document.getElementById("seccion-caja").style.display = "block";
        cargarProductosPOS(); 

    } else if (seccion === 'configuracion') {
        document.getElementById("seccion-configuracion").style.display = "block";
        cargarConfiguracion(); 

    } else if (seccion === 'inventario') { 
        const divInv = document.getElementById("seccion-inventario");
        if(divInv) divInv.style.display = "block";

    } else if (seccion === 'usuarios') { 
        // 👇 AQUÍ ES DONDE DEBE IR (AL FINAL DE LA CADENA)
        const divUsuarios = document.getElementById("seccion-usuarios");
        if (divUsuarios) divUsuarios.style.display = "block";
        cargarUsuarios(); // ✅ Llamamos a la base de datos
    }else if (seccion === 'finanzas') { 
        document.getElementById("seccion-finanzas").style.display = "block";
        cargarFinanzas();
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
        title: 'SEGURIDAD REQUERIDA',
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

// --- GESTIÓN DE USUARIOS ---

async function cargarUsuarios() {
    const token = localStorage.getItem("stockpilot_token");
    try {
        // Pedimos la lista al backend
        const res = await fetch(`${API_URL}/usuarios/`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if(res.ok) {
            const usuarios = await res.json();
            const tabla = document.getElementById("tablaUsuarios");
            tabla.innerHTML = "";
            
            usuarios.forEach(u => {
                // Coloreamos la etiqueta según el rol
                const color = u.rol === 'admin' ? '#805ad5' : '#38a169'; 
                
                tabla.innerHTML += `
                    <tr>
                        <td>${u.id}</td>
                        <td><strong>${u.username}</strong></td>
                        <td><span style="background:${color}; color:white; padding: 2px 8px; border-radius: 10px; font-size: 0.8em;">${u.rol}</span></td>
                        <td>
                            ${u.username !== 'admin' ? 
                            `<button class="btn-icon" style="background:#e53e3e; color:white;" onclick="eliminarUsuario(${u.id})"><i class="fas fa-trash"></i></button>` 
                            : ''}
                        </td>
                    </tr>
                `;
            });
        }
    } catch (e) { console.error(e); }
}

async function registrarUsuario(e) {
    e.preventDefault();
    const token = localStorage.getItem("stockpilot_token");
    
    // Tomamos los datos del formulario
    const datos = {
        username: document.getElementById("new_user").value,
        password: document.getElementById("new_pass").value,
        rol: document.getElementById("new_rol").value
    };

    try {
        const res = await fetch(`${API_URL}/registrar/`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(datos)
        });

        if(res.ok) {
            alert("✅ Usuario creado exitosamente");
            document.getElementById("new_user").value = "";
            document.getElementById("new_pass").value = "";
            cargarUsuarios(); // Recargamos la tabla
        } else {
            const err = await res.json();
            alert("❌ Error: " + err.detail);
        }
    } catch (error) {
        alert("Error de conexión");
    }
}

async function eliminarUsuario(id) {
    if(!confirm("¿Estás seguro de eliminar a este usuario?")) return;
    
    const token = localStorage.getItem("stockpilot_token");
    const res = await fetch(`${API_URL}/usuarios/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
    });
    
    if(res.ok) {
        cargarUsuarios();
    } else {
        alert("No se pudo eliminar");
    }
}

// --- MÓDULO DE FINANZAS (VERSIÓN PRO: GANANCIAS Y MÁRGENES) ---
async function cargarFinanzas() {
    const token = localStorage.getItem("stockpilot_token");
    try {
        const res = await fetch(`${API_URL}/productos/`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (res.ok) {
            const productos = await res.json();
            
            let capitalVenta = 0;  // Valor si vendes todo (Ingreso Potencial)
            let capitalCosto = 0;  // Lo que te costó comprarlo (Costo de Ventas)
            let totalItems = 0;
            
            productos.forEach(p => {
                // 1. Usamos los nombres NUEVOS de tu Base de Datos
                const stock = p.stock_actual; 
                const venta = p.precio_venta;
                const compra = p.precio_compra;

                capitalVenta += (venta * stock);
                capitalCosto += (compra * stock);
                totalItems += stock;
            });

            // 2. Llenar Tarjetas KPIs (Indicadores Clave)
            // Tarjeta Azul: Valor de Mercado (Activo Realizable)
            document.getElementById("fin-capital-total").textContent = capitalVenta.toLocaleString('es-MX', {minimumFractionDigits: 2});
            
            // Tarjeta Roja: Cantidad de piezas
            document.getElementById("fin-items").textContent = totalItems;
            
            // Tarjeta Amarilla: MARGEN DE GANANCIA GLOBAL
            // (Utilidad Bruta / Ventas Totales)
            const utilidadGlobal = capitalVenta - capitalCosto;
            const margenGlobal = capitalVenta > 0 ? (utilidadGlobal / capitalVenta) * 100 : 0;
            
            const elPromedio = document.getElementById("fin-promedio");
            // Cambiamos el contenido de la tarjeta del medio para mostrar el Margen
            elPromedio.innerHTML = `
                <span style="color: ${margenGlobal >= 30 ? '#48bb78' : '#e53e3e'}; font-weight: bold;">
                    ${margenGlobal.toFixed(1)}%
                </span>
                <br><small style="color: gray; font-size: 0.6em;">Margen de Utilidad</small>
            `;

            // 3. TABLA DE ANÁLISIS (Top Productos por Utilidad)
            const tabla = document.getElementById("tablaFinanzas");
            tabla.innerHTML = "";

            // Ordenamos: Los que dejan más DINERO (Utilidad) van primero
            productos.sort((a, b) => {
                const utilidadA = (a.precio_venta - a.precio_compra) * a.stock_actual;
                const utilidadB = (b.precio_venta - b.precio_compra) * b.stock_actual;
                return utilidadB - utilidadA; // Mayor a menor
            });

            productos.forEach(p => {
                const utilidadUnit = p.precio_venta - p.precio_compra;
                const utilidadTotal = utilidadUnit * p.stock_actual;
                // Margen individual
                const margen = p.precio_venta > 0 ? (utilidadUnit / p.precio_venta) * 100 : 0;

                // Color del margen (Verde si ganas > 30%, Rojo si es poco)
                const colorMargen = margen >= 30 ? "green" : "red";
                const bgMargen = margen >= 30 ? "#c6f6d5" : "#fed7d7";

                tabla.innerHTML += `
                    <tr>
                        <td><strong>${p.nombre}</strong></td>
                        <td>${p.stock_actual}</td>
                        <td>
                            <small style="color:gray;">Compra:</small> $${p.precio_compra}<br>
                            <small style="color:green;">Venta:</small> <strong>$${p.precio_venta}</strong>
                        </td>
                        <td style="color: #2b6cb0; font-weight:bold;">
                            $${utilidadTotal.toLocaleString('es-MX')}
                            <br><small style="color:gray; font-weight:normal;">(Ganancia Est.)</small>
                        </td>
                        <td>
                             <span style="background:${bgMargen}; color:${colorMargen}; padding:2px 6px; border-radius:4px; font-weight:bold;">
                                ${margen.toFixed(1)}%
                             </span>
                        </td>
                    </tr>
                `;
            });
        }
    } catch (error) {
        console.error("Error financiero:", error);
    }
}