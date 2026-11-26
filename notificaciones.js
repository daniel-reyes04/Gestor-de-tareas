export async function pedirPermisoNotificaciones() {
  if (!("Notification" in window)) return "no-soportado";
  return Notification.requestPermission();
}

export async function mostrarAvisoLocal(titulo, cuerpo, url = "/index.html") {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(titulo, {
    body: cuerpo,
    icon: "/icons/icon-192.png",
    tag: "gestor-aviso",
    data: { url },
  });
}