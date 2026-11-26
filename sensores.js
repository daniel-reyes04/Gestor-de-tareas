
export async function pedirPermisoSensores() {
  if (!("DeviceMotionEvent" in window)) return "no-soportado";
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      return await DeviceMotionEvent.requestPermission();   
    } catch {
      return "denied";           
    }
  }
  return "no-necesario";         
}

export function hayLecturasReales(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const alRecibir = (e) => {
      const a = e.accelerationIncludingGravity;
      if (a && a.x !== null) { limpiar(); resolve(true); }
    };
    const limpiar = () => {
      window.removeEventListener("devicemotion", alRecibir);
      clearTimeout(t);
    };
    const t = setTimeout(() => { limpiar(); resolve(false); }, timeoutMs);
    window.addEventListener("devicemotion", alRecibir);
  });
}

export function escucharOrientacion(callback, intervaloMs = 100) {
  let ultimo = 0;
  const manejador = (e) => {
    const ahora = performance.now();
    if (ahora - ultimo < intervaloMs) return;
    ultimo = ahora;
    if (e.beta === null) return;                       // sin sensor
    callback({ alfa: e.alpha, beta: e.beta, gamma: e.gamma });
  };
  window.addEventListener("deviceorientation", manejador);
  return () => window.removeEventListener("deviceorientation", manejador);
}

export function detectarSacudida(onSacudida, { umbral = 12, enfriamientoMs = 1000 } = {}) {
  const GRAVEDAD = 9.81;
  let ultimaSacudida = 0;
  const manejador = (e) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null) return;
    const magnitud = Math.hypot(a.x, a.y, a.z);
    const desviacion = Math.abs(magnitud - GRAVEDAD);
    const ahora = performance.now();
    if (desviacion > umbral && ahora - ultimaSacudida > enfriamientoMs) {
      ultimaSacudida = ahora;
      onSacudida(Math.round(desviacion * 10) / 10);
    }
  };
  window.addEventListener("devicemotion", manejador);
  return () => window.removeEventListener("deviceorientation", manejador);
}