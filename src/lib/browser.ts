export function browserLabel(userAgent: string | null | undefined) {
  const ua = userAgent?.trim() ?? "";
  if (!ua) return "Không rõ";
  const browser = ua.includes("Edg/")
    ? "Edge"
    : ua.includes("OPR/") || ua.includes("Opera")
      ? "Opera"
      : ua.includes("Firefox/")
        ? "Firefox"
        : ua.includes("Chrome/")
          ? "Chrome"
          : ua.includes("Safari/")
            ? "Safari"
            : "Trình duyệt khác";
  const device = /iPhone|iPad/.test(ua)
    ? "iPhone/iPad"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Macintosh/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return device ? `${browser} · ${device}` : browser;
}
