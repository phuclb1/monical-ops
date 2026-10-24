const CACHE = "ops-monical-v7";
const SHELL = ["/offline.html", "/logo.png", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];
const STATIC_EXT = /\.(?:js|css|woff2?|png|jpe?g|gif|webp|svg|ico)$/;
const SKIP_HTML = /^\/(login|forgot-password|reset-password)(?:\/|$)/;

function isStatic(url) {
  return url.pathname.startsWith("/_next/static") || STATIC_EXT.test(url.pathname);
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function putCache(req, res) {
  if (!res || !res.ok || res.type !== "basic") return res;
  const copy = res.clone();
  caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
  return res;
}

function networkFirstNavigate(req, timeoutMs = 1400) {
  return caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(req);
    const network = fetch(req)
      .then((res) => putCache(req, res))
      .catch(() => null);
    if (!cached) return (await network) || cache.match("/offline.html");
    const raced = await Promise.race([
      network,
      new Promise((resolve) => setTimeout(() => resolve("timeout"), timeoutMs)),
    ]);
    if (raced && raced !== "timeout") return raced;
    return cached;
  });
}

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
  if (!isSameOrigin(url) || url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => putCache(req, res)),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    if (SKIP_HTML.test(url.pathname)) {
      event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
      return;
    }
    event.respondWith(networkFirstNavigate(req));
    return;
  }

  event.respondWith(
    fetch(req).catch(async () => {
      const cached = await caches.match(req);
      return cached || caches.match("/offline.html");
    }),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Monical Quản lý vận hành", body: "Có thông báo mới", url: "/notifications", tag: "ops-booking" };
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
  const path = event.notification.data?.url || "/";
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
