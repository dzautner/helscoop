function safeNotificationPath(value) {
  if (typeof value !== "string" || !value.trim()) return "/";

  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return "/";
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return "/";
  }
}

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
  const url = safeNotificationPath(event.notification.data?.url);
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientPath = safeNotificationPath(client.url);
        if ("focus" in client && clientPath === url) return client.focus();
      }
      return clients.openWindow(url);
    }),
  );
});
