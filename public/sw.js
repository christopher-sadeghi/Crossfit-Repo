const CACHE = "fitcoach-offline-v1";
const safeLink = (link) => {
  try {
    const url = new URL(typeof link === "string" ? link : "/", self.location.origin);
    return url.origin === self.location.origin ? url.href : self.location.origin + "/";
  } catch { return self.location.origin + "/"; }
};
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add("/offline.html")));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("fitcoach-offline-") && key !== CACHE).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then((cache) => cache.match("/offline.html"))));
  }
});
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  if (!payload || typeof payload !== "object") return;
  event.waitUntil(self.registration.showNotification(typeof payload.title === "string" ? payload.title : "FitCoach AI", {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: typeof payload.tag === "string" ? payload.tag : undefined,
    data: { link: safeLink(payload.link) },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = safeLink(event.notification.data?.link);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(link);
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(link);
  })());
});
