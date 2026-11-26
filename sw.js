importScripts("lib/workbox-v7.4.1/workbox-sw.js");
workbox.setConfig({ modulePathPrefix: "lib/workbox-v7.4.1/", debug: false });

const { precacheAndRoute, cleanupOutdatedCaches } = workbox.precaching;
const { registerRoute } = workbox.routing;
const { CacheFirst, NetworkFirst } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;

self.skipWaiting();
workbox.core.clientsClaim();
cleanupOutdatedCaches();

precacheAndRoute([{"revision":"7c3577dec1f5fd3befe27ebeee204d61","url":"index.html"},{"revision":"a25b8bf8688a0decc5f0ecbe5748dd1c","url":"manifest.json"},{"revision":"917a3ab90cd61d57dbed7029d163cd21","url":"css/estilos.css"},{"revision":"224f2c46309c5cef7fd19c4859154b47","url":"workbox-395b32c3.js"},{"revision":"25dcd808e352e65f3467f7f8714aa329","url":"tareas.js"},{"revision":"cea946ca4ad9dd37a25ad1a86cdbc552","url":"sync.js"},{"revision":"2027b52427d8b1bb266816652c9f507a","url":"sensores.js"},{"revision":"429bea22e3a5c1b574a51e366a6e1273","url":"notificaciones.js"},{"revision":"e65893de8510ddb11f258ced2ff546be","url":"dispositivo.js"},{"revision":"6888290c0483ba9d3f526111e20b4778","url":"db.js"},{"revision":"be2c1f840f875af67a2bd953fbef7381","url":"crypto.js"},{"revision":"2cfc6419dcb6ac7291adf029d378f6d9","url":"app.js"},{"revision":"11d8718185e73f6565e6c4048ffcb580","url":"icons/icon-96-incorrecto.png"},{"revision":"916675198be1f0b31c9535700364d050","url":"icons/icon-512.png"},{"revision":"238df3f8103dfc9c36e481b23510eb84","url":"icons/icon-512-maskable.png"},{"revision":"30dad524c42638418c4249e28bda4dbe","url":"icons/icon-192.png"}]); 

registerRoute(
  ({ url }) => url.pathname.startsWith("/icons/"),
  new CacheFirst({
    cacheName: "imagenes",
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  })
);
registerRoute(({ url }) => url.pathname.startsWith("/api/"), new NetworkFirst({ cacheName: "api-tareas" }));

async function vaciarBandeja() {
  const db = await new Promise((resolve, reject) => {
    const peticion = indexedDB.open("gestor-tareas-db", 2);
    peticion.onsuccess = (e) => resolve(e.target.result);
    peticion.onerror = (e) => reject(e.target.error);
  });

  const pendientes = await new Promise((resolve, reject) => {
    const tx = db.transaction("outbox", "readonly");
    const peticion = tx.objectStore("outbox").getAll();
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });

  let enviados = 0;
  for (const cambio of pendientes) {
    // Intentamos enviar al servidor (asumiendo que corre en /api/tareas)
    try {
      const resp = await fetch("/api/tareas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambio),
      });

      if (!resp.ok) throw new Error("El servidor respondió " + resp.status);

      await new Promise((resolve, reject) => {
        const tx = db.transaction("outbox", "readwrite");
        const peticion = tx.objectStore("outbox").delete(cambio.idCambio);
        peticion.onsuccess = () => resolve();
        peticion.onerror = () => reject(peticion.error);
      });
      enviados++;
    } catch (error) {
      console.error("Fallo al enviar tarea, se reintentará luego:", error);
      throw error; // Lanza para que el navegador reprograme el sync
    }
  }
  return enviados;
}

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-tareas") {
    console.log("Evento sync disparado: intentando vaciar bandeja...");
    event.waitUntil(
      vaciarBandeja().then((cantidad) => {
        if (cantidad > 0) {
          self.registration.showNotification("Sincronización completa", {
            body: `Se enviaron ${cantidad} tareas pendientes al servidor.`,
            icon: "/icons/icon-192.png",
            tag: "gestor-sync"
          });
        }
      })
    );
  }
});

self.addEventListener("push", (event) => {
  let datos = { titulo: "Gestor de Tareas", cuerpo: "Tienes novedades.", url: "/index.html" };
  try {
    if (event.data) datos = { ...datos, ...event.data.json() };
  } catch {
    if (event.data) datos.cuerpo = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: "/icons/icon-192.png",
      tag: datos.tag ?? "gestor-aviso",
      data: { url: datos.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url ?? "/index.html", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const ventanas = await clients.matchAll({ type: "window", includeUncontrolled: true });
      const abierta = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
      if (abierta) return abierta.focus();
      return clients.openWindow(destino);
    })()
  );
});