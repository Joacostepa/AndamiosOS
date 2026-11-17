// Service worker de AndamiosOS: sólo las notificaciones push (no guarda nada offline).
// El servidor manda { titulo, cuerpo, url, tag } (src/lib/push/servidor.ts). Avisos con el
// mismo tag se reemplazan (uno por charla) y vuelven a sonar (renotify).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { cuerpo: event.data ? event.data.text() : "" };
  }
  const tag = d.tag || undefined;
  event.waitUntil(
    self.registration.showNotification(d.titulo || "AndamiosOS", {
      body: d.cuerpo || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag,
      renotify: !!tag,
      data: { url: d.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const v of ventanas) {
        if (new URL(v.url).origin === self.location.origin && "focus" in v) {
          await v.focus();
          if ("navigate" in v) await v.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
