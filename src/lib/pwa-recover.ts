const KEY = "ops:pwa-home-fallback";

export function shouldFallbackPwaHome(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? String(error.name || "") : "";
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(`${name} ${message}`);
}

export function fallbackPwaHome() {
  if (typeof window === "undefined") return false;
  const here = window.location.pathname || "/";
  let last = "";
  try {
    last = sessionStorage.getItem(KEY) || "";
  } catch {
    last = "";
  }
  if (last === here) return false;
  try {
    sessionStorage.setItem(KEY, here);
  } catch {
    // private mode
  }
  navigator.serviceWorker?.controller?.postMessage({ type: "ops-recover-home", path: here });
  if (here === "/") {
    window.location.reload();
    return true;
  }
  window.location.replace("/");
  return true;
}

export function clearPwaHomeFallback() {
  if (typeof window === "undefined") return;
  try {
    const here = window.location.pathname || "/";
    if (sessionStorage.getItem(KEY) === here) sessionStorage.removeItem(KEY);
  } catch {
    // private mode
  }
}
