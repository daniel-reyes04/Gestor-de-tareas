importScripts("lib/workbox-v7.4.1/workbox-sw.js");
workbox.setConfig({ modulePathPrefix: "lib/workbox-v7.4.1/", debug: false });

const { precacheAndRoute, cleanupOutdatedCaches } = workbox.precaching;
const { registerRoute } = workbox.routing;
const { CacheFirst, NetworkFirst } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;

self.skipWaiting();
workbox.core.clientsClaim();
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST); 

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