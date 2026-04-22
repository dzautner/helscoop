self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Helscoop";
  const options = {
    body: payload.body || "A material price changed.",
    tag: payload.tag || "helscoop-alert",
    data: payload,
    icon: "/icon.svg",
    badge: "/icon.svg",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && client.url.endsWith(url)) return client.focus();
      }
      return clients.openWindow(url);
    }),
  );
});
