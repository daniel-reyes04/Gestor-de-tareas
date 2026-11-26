// 1. Consultar el estado de los permisos sin mostrar avisos al usuario
export async function estadoPermiso(nombre) {
  try {
    const r = await navigator.permissions.query({ name: nombre });
    return r.state;            // "granted" | "denied" | "prompt"
  } catch {
    return "desconocido";      // el navegador no soporta ese nombre
  }
}

// 2. Función para abrir la cámara solicitando la resolución ideal
export function abrirCamara(facingMode = "environment") {
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facingMode },   // "user" = frontal, "environment" = trasera
      width:  { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
}

// 3. Manejo de errores específicos de la cámara
export function describirErrorCamara(err) {
  switch (err?.name) {
    case "NotAllowedError":
      return "Bloqueaste el permiso de cámara. Habilítalo desde el candado de la barra de direcciones.";
    case "NotFoundError":
      return "Este dispositivo no tiene cámara disponible.";
    case "NotReadableError":
      return "La cámara está siendo usada por otra aplicación.";
    case "OverconstrainedError":
      return "La cámara no soporta la configuración pedida.";
    case "TypeError":
      return "La cámara solo funciona en HTTPS o en localhost.";
    default:
      return `No se pudo abrir la cámara (${err?.name ?? "error desconocido"}).`;
  }
}

// 4. Tomar la foto desde el video usando un canvas y exportar a Blob
export function capturarFoto(video, anchoMax = 640) {
  const escala = Math.min(1, anchoMax / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width  = Math.round(video.videoWidth  * escala);
  canvas.height = Math.round(video.videoHeight * escala);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
}

// 5. Función para obtener la ubicación (GPS o red)
export function obtenerUbicacion({ altaPrecision = false, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject({ code: 0, message: "Geolocation no disponible" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        precision: Math.round(pos.coords.accuracy),
        momento: new Date(pos.timestamp).toISOString(),
      }),
      reject,
      { enableHighAccuracy: altaPrecision, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}

// 6. Manejo de errores específicos de la ubicación
export function describirErrorUbicacion(err) {
  switch (err?.code) {
    case 1: return "Denegaste el permiso de ubicación. La tarea sigue funcionando sin ella.";
    case 2: return "No se pudo determinar la posición (sin señal GPS o de red).";
    case 3: return "La ubicación tardó demasiado en responder. Intenta de nuevo.";
    default: return "La ubicación no está disponible en este navegador.";
  }
}

export function abrirMicrofono() {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: false,
  });
}

export function crearMedidorDeNivel(stream) {
  const ctx = new AudioContext();
  ctx.resume();                       // llámalo dentro de un clic (política de autoplay)
  const analizador = ctx.createAnalyser();
  analizador.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analizador);
  const datos = new Uint8Array(analizador.fftSize);
  return {
    leer() {                          // 0 = silencio, 1 = máximo
      analizador.getByteTimeDomainData(datos);
      let pico = 0;
      for (const v of datos) pico = Math.max(pico, Math.abs(v - 128));
      return pico / 128;
    },
    cerrar() { stream.getTracks().forEach((p) => p.stop()); ctx.close(); },
  };
}

export function detenerCamara(stream) {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
}