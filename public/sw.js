// Service worker mínimo: hace la web instalable. No guarda nada en caché a
// propósito: el CRM muestra datos privados y en vivo, y una copia vieja sería
// peor que no tener copia.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
