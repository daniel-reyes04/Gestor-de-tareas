import { crearTarea, renderizarTarea } from "./tareas.js";
import { derivarClaveDesdeContrasena } from "./crypto.js";
import { encolarCambio, pedirSincronizacion } from './sync.js';
import { 
  abrirBaseDeDatos, 
  guardarTareaConNota, 
  agregarTarea, 
  obtenerTodasLasTareas, 
  eliminarTareaDB,
  completarTareasPorPrioridad 
} from "./db.js";

import { 
  abrirCamara, 
  detenerCamara, 
  capturarFoto, 
  describirErrorCamara, 
  obtenerUbicacion, 
  describirErrorUbicacion, 
  abrirMicrofono, 
  crearMedidorDeNivel 
} from './dispositivo.js';

import { 
  pedirPermisoSensores, 
  hayLecturasReales, 
  escucharOrientacion, 
  detectarSacudida 
} from './sensores.js';

import { pedirPermisoNotificaciones, mostrarAvisoLocal } from './notificaciones.js';

// --------------------------------------------------------
// LÓGICA DE SENSORES Y DESHACER
// --------------------------------------------------------
let ultimaTareaEliminada = null;
let detenerSensores = null;

const btnDeshacer = document.getElementById('btn-deshacer');
const btnSensores = document.getElementById('btn-sensores');
const textoOrientacion = document.getElementById('texto-orientacion');

// Función para restaurar la tarea
async function deshacerEliminacion() {
  if (!ultimaTareaEliminada) return;
  try {
    // Al restaurar, generamos un ID nuevo o usamos la misma lógica de agregar
    await agregarTarea(db, ultimaTareaEliminada);
    ultimaTareaEliminada = null;
    btnDeshacer.style.display = "none";
    tareas = await obtenerTodasLasTareas(db);
    pintarTodo();
    alert("Tarea restaurada correctamente.");
  } catch (error) {
    console.error("Error al restaurar:", error);
  }
}

if(btnDeshacer) btnDeshacer.addEventListener('click', deshacerEliminacion);

// Modifica la función original 'eliminarTarea' (búscala en tu código y reemplázala)
async function eliminarTarea(id) {
  try {
    const tareaAEliminar = tareas.find(t => t.id === id);
    if (tareaAEliminar) {
      ultimaTareaEliminada = { ...tareaAEliminar };
      delete ultimaTareaEliminada.id; // Para que se le asigne uno nuevo en BD
      if(btnDeshacer) btnDeshacer.style.display = "inline-block"; // Mostrar botón de respaldo
    }
    
    await eliminarTareaDB(db, id);
    tareas = await obtenerTodasLasTareas(db);
    pintarTodo();
  } catch (error) {
    console.error("Error al eliminar la tarea:", error);
  }
}

// Activar los sensores
if(btnSensores) {
  btnSensores.addEventListener('click', async () => {
    if (detenerSensores) {
      detenerSensores.orientacion();
      detenerSensores.sacudida();
      detenerSensores = null;
      btnSensores.textContent = "📳 Activar agitar para deshacer";
      textoOrientacion.textContent = "";
      return;
    }

    const permiso = await pedirPermisoSensores();
    if (permiso === "denied") {
      alert("Permiso denegado. Usa el botón 'Deshacer eliminación'.");
      return;
    }

    const haySensores = await hayLecturasReales();
    if (!haySensores) {
      alert("Este dispositivo no tiene sensores de movimiento. Usa el botón 'Deshacer eliminación'.");
      return;
    }

    btnSensores.textContent = "📳 Desactivar sensores";
    
    const pararOrientacion = escucharOrientacion((datos) => {
      textoOrientacion.textContent = `Inclinación: β ${Math.round(datos.beta)}° · γ ${Math.round(datos.gamma)}°`;
    });

    const pararSacudida = detectarSacudida((desviacion) => {
      console.log(`Sacudida detectada (Desviación: ${desviacion})`);
      if (ultimaTareaEliminada) {
          deshacerEliminacion();
      }
    });

    detenerSensores = { orientacion: pararOrientacion, sacudida: pararSacudida };
  });
}

let db;
let tareas = [];
let sal = localStorage.getItem('app_sal');

if (!sal) {
    sal = crypto.getRandomValues(new Uint8Array(16));
    localStorage.setItem('app_sal', JSON.stringify(Array.from(sal)));
} else {
    sal = new Uint8Array(JSON.parse(sal));
}

// --------------------------------------------------------
// REFERENCIAS AL DOM
// --------------------------------------------------------
const listaEl = document.getElementById("lista-tareas");
const formEl = document.getElementById("form-tarea");
const inputTituloEl = document.getElementById("input-titulo");
const inputPrioridadEl = document.getElementById("input-prioridad");
const btnAvisos = document.getElementById("btn-avisos"); // Agregada la referencia del botón

const btnFoto = document.getElementById('btn-foto');
const btnUbicacion = document.getElementById('btn-ubicacion');
const btnMicrofono = document.getElementById('btn-microfono');
const textoUbicacion = document.getElementById('texto-ubicacion');
const medidorAudio = document.getElementById('medidor-audio');

const dlgCamara = document.getElementById('dlg-camara');
const videoCamara = document.getElementById('video-camara');
const btnCapturarFoto = document.getElementById('btn-capturar-foto');
const btnCerrarCamara = document.getElementById('btn-cerrar-camara');

// --------------------------------------------------------
// ESTADO DEL HARDWARE Y MEMORIA
// --------------------------------------------------------
let streamCamaraActual = null;
let streamMicrofonoActual = null;
let medidorActual = null;
let animacionMedidor = null;

let fotoAdjuntaBlob = null; 
let ubicacionAdjunta = null;
let urlsTemporales = [];

// Limpia las URLs de memoria antes de repintar la lista
export function limpiarUrlsTemporales() {
  urlsTemporales.forEach(url => URL.revokeObjectURL(url));
  urlsTemporales = [];
}

// --------------------------------------------------------
// FUNCIONES DE RENDERIZADO
// --------------------------------------------------------
const pintarTodo = () => {
  limpiarUrlsTemporales();
  listaEl.innerHTML = "";
  tareas.forEach((tarea) =>
    renderizarTarea(tarea, listaEl, {
      onToggle: alternarCompletada,
      onEliminar: eliminarTarea,
      urlsTemporales: urlsTemporales 
    })
  );
};

async function alternarCompletada(id) {
  try {
    tareas = tareas.map((t) => (t.id === id ? { ...t, completada: !t.completada } : t));
    pintarTodo();
  } catch (error) {
    console.error("Error al alternar estado:", error);
  }
}

// --------------------------------------------------------
// EVENTOS DE HARDWARE
// --------------------------------------------------------

// CÁMARA
if(btnFoto) {
  btnFoto.addEventListener('click', async () => {
    try {
      streamCamaraActual = await abrirCamara("environment");
      videoCamara.srcObject = streamCamaraActual;
      dlgCamara.showModal();
    } catch (err) {
      alert(describirErrorCamara(err));
    }
  });
}

if(btnCapturarFoto) {
  btnCapturarFoto.addEventListener('click', async () => {
    if (!streamCamaraActual) return;
    fotoAdjuntaBlob = await capturarFoto(videoCamara, 640);
    dlgCamara.close();
    btnFoto.textContent = "📷 Foto (Capturada)";
  });
}

if(btnCerrarCamara) {
  btnCerrarCamara.addEventListener('click', () => {
    dlgCamara.close();
  });
}

if(dlgCamara) {
  dlgCamara.addEventListener('close', () => {
    detenerCamara(streamCamaraActual);
    streamCamaraActual = null;
  });
}

// UBICACIÓN
if(btnUbicacion) {
  btnUbicacion.addEventListener('click', async () => {
    btnUbicacion.textContent = "📍 Buscando...";
    try {
      const pos = await obtenerUbicacion({ altaPrecision: false, timeoutMs: 10000 });
      ubicacionAdjunta = pos; 
      textoUbicacion.textContent = `Lat: ${pos.lat.toFixed(4)}, Lon: ${pos.lon.toFixed(4)} (±${pos.precision}m)`;
      btnUbicacion.textContent = "📍 Ubicación (Lista)";
    } catch (err) {
      alert(describirErrorUbicacion(err));
      btnUbicacion.textContent = "📍 Ubicación";
    }
  });
}

// MICRÓFONO
if(btnMicrofono) {
  btnMicrofono.addEventListener('click', async () => {
    if (streamMicrofonoActual) {
      detenerMicrofono();
      return;
    }
    try {
      streamMicrofonoActual = await abrirMicrofono();
      medidorActual = crearMedidorDeNivel(streamMicrofonoActual);
      medidorAudio.style.display = "block";
      btnMicrofono.textContent = "🛑 Detener Micrófono";
      
      const actualizarMedidor = () => {
        if (medidorActual) {
          medidorAudio.value = medidorActual.leer();
          animacionMedidor = requestAnimationFrame(actualizarMedidor);
        }
      };
      actualizarMedidor();
    } catch (err) {
      alert("No se pudo abrir el micrófono: " + err.name);
    }
  });
}

function detenerMicrofono() {
  if (medidorActual) {
    medidorActual.cerrar();
    medidorActual = null;
  }
  if (animacionMedidor) {
    cancelAnimationFrame(animacionMedidor);
    animacionMedidor = null;
  }
  streamMicrofonoActual = null;
  if(medidorAudio) {
    medidorAudio.style.display = "none";
    medidorAudio.value = 0;
  }
  if(btnMicrofono) btnMicrofono.textContent = "🎤 Micrófono";
}

// --------------------------------------------------------
// LÓGICA: Guardar tarea interceptando el formulario
// --------------------------------------------------------
if (formEl) {
  formEl.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    
    const titulo = inputTituloEl.value.trim();
    const prioridad = inputPrioridadEl.value;
    
    const inputNotaEl = document.getElementById('input-nota');
    const inputContrasenaEl = document.getElementById('input-contrasena');
    
    const notaPrivada = inputNotaEl ? inputNotaEl.value.trim() : "";
    const contrasenaUsuario = inputContrasenaEl ? inputContrasenaEl.value : "";

    if (!titulo) return;

    if (notaPrivada !== "" && !contrasenaUsuario) {
        alert("Necesitas una contraseña para cifrar la nota privada");
        return;
    }

    try {
        let nuevaTarea = crearTarea(titulo, prioridad);
        
        nuevaTarea.foto = fotoAdjuntaBlob;
        nuevaTarea.ubicacion = ubicacionAdjunta;
        
        if (notaPrivada !== "") {
            nuevaTarea.notaPrivada = notaPrivada;
            const clave = await derivarClaveDesdeContrasena(contrasenaUsuario, sal);
            await guardarTareaConNota(db, clave, nuevaTarea);
            alert("Tarea guardada y cifrada con éxito");
        } else {
            await agregarTarea(db, nuevaTarea); 
        }

        await encolarCambio(db, "crear-tarea", { titulo: nuevaTarea.titulo, prioridad: nuevaTarea.prioridad });
        
        try {
          await pedirSincronizacion(db);
          console.log("Sincronización en segundo plano solicitada con éxito.");
        } catch (err) {
          console.warn("No se pudo sincronizar todavía:", err.message);
        }
        
        tareas = await obtenerTodasLasTareas(db);
        pintarTodo();
        formEl.reset();
        fotoAdjuntaBlob = null;
        ubicacionAdjunta = null;
        if(textoUbicacion) textoUbicacion.textContent = "";
        if(btnFoto) btnFoto.textContent = "📷 Foto";
        if(btnUbicacion) btnUbicacion.textContent = "📍 Ubicación";

    } catch (error) {
        console.error("Error al guardar la tarea:", error);
    }
  });
}

// --------------------------------------------------------
// INICIO DE LA APP
// --------------------------------------------------------
async function iniciar() {
  try {
      console.log("Intentando abrir la base de datos...");
      db = await abrirBaseDeDatos();
      console.log("¡Base de datos lista y abierta!");
      
      tareas = await obtenerTodasLasTareas(db);
      pintarTodo();

      window.probarCursor = async (prioridad) => {
          const cantidad = await completarTareasPorPrioridad(db, prioridad);
          console.log(`Se marcaron como hechas ${cantidad} tareas de prioridad: ${prioridad}`);
          tareas = await obtenerTodasLasTareas(db);
          pintarTodo();
      };

  } catch (error) {
      console.error("ERROR DETALLADO EN INICIAR:", error);
  }
}

iniciar();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js')
    .then(reg => console.log('SW registrado:', reg.scope))
    .catch(err => console.error('Error al registrar SW:', err));
}

// --------------------------------------------------------
// NOTIFICACIONES PUSH
// --------------------------------------------------------
if(btnAvisos) {
  btnAvisos.addEventListener("click", async () => {
    const permiso = await pedirPermisoNotificaciones();
    if (permiso === "granted") {
      await mostrarAvisoLocal("Avisos activados", "Así se verán las notificaciones del Gestor.");
    } else {
      alert("No se activaron los avisos. La app sigue funcionando igual.");
    }
  });
}