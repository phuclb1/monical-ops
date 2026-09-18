const CACHE = "ops-monical-v5";
const SHELL = ["/", "/today", "/login", "/offline.html", "/logo.png", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        return cached || caches.match("/offline.html");
      }),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "MONICAL Ops", body: "Có thông báo mới", url: "/notifications", tag: "ops-booking" };
  try {
    const parsed = event.data?.json();
    if (parsed && typeof parsed === "object") {
      const nested = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
      data = { ...data, ...nested };
    }
  } catch {
    const text = event.data?.text();
    if (text) data.body = text;
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || data.url || "ops-booking",
      renotify: true,
      vibrate: [80, 40, 80],
      data: { url: data.url || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/today";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(path);
          return;
        }
      }
      return self.clients.openWindow(path);
    }),
  );
});
