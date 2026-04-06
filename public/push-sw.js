// Minimal push notification service worker — no caching, instant activation
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { data = { title: "IE Central", body: event.data.text() }; }
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192x192.svg",
    badge: data.badge || "/icons/icon-72x72.svg",
    tag: data.tag || "ie-central-notification",
    renotify: true,
    data: { url: data.url || "/" },
    actions: [{ action: "open", title: "Open" }, { action: "dismiss", title: "Dismiss" }],
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(data.title || "IE Central", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
