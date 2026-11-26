
export function encolarCambio(db, tipo, datos) {
  const cambio = { idCambio: crypto.randomUUID(), tipo, datos, creadoEn: Date.now() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox", "readwrite");
    tx.objectStore("outbox").add(cambio);
    tx.oncomplete = () => resolve(cambio.idCambio);
    tx.onerror = () => reject(tx.error);
  });
}

function haySyncEnSegundoPlano() {
  return "serviceWorker" in navigator && "SyncManager" in window;
}

export async function pedirSincronizacion(db) {
  if (haySyncEnSegundoPlano()) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register("sync-tareas"); // Registra la etiqueta
      return "segundo-plano";
    } catch (err) {
      console.warn("Background Sync bloqueado o falló el registro", err);
    }
  }
  
  console.log("Se usaría el plan B enviando directamente desde la página");
  return "desde-la-pagina";
}