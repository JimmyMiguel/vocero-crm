// Service worker: hace la web instalable y recibe notificaciones push. No guarda
// nada en caché a propósito: el CRM muestra datos privados y en vivo, y una
// copia vieja sería peor que no tener copia.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Nuevo mensaje";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/api/branding/pwa-icon?size=192",
      badge: "/api/branding/pwa-icon?size=192",
      tag: data.tag || "mensaje",
      renotify: true,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
