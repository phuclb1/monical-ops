const DEFAULT_SITE_URL = "https://platform.monicalhoteldalat.com";

export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_SITE_URL;

export function absoluteUrl(path: string) {
  return new URL(path, `${SITE_URL.replace(/\/$/, "")}/`).toString();
}

export function resolveAppOrigin(input: {
  configured?: string | null;
  host?: string | null;
  proto?: string | null;
  built?: string | null;
}) {
  const configured = normalizeOrigin(input.configured);
  if (configured) return configured;
  const host = firstHeaderValue(input.host);
  if (host) {
    const proto =
      firstHeaderValue(input.proto) ||
      (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return normalizeOrigin(input.built) || DEFAULT_SITE_URL;
}

export function rewriteLocalhostUrl(message: string, origin: string) {
  return message.replace(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/g, origin.replace(/\/$/, ""));
}

export async function appOrigin() {
  const { headers } = await import("next/headers");
  const headerStore = await headers();
  return resolveAppOrigin({
    configured: await configuredAppUrl(),
    host: headerStore.get("x-forwarded-host") ?? headerStore.get("host"),
    proto: headerStore.get("x-forwarded-proto"),
    built: process.env.NEXT_PUBLIC_APP_URL,
  });
}

function normalizeOrigin(value?: string | null) {
  const trimmed = value?.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "";
}

function firstHeaderValue(value?: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

async function configuredAppUrl() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const configured = (env as { NEXT_PUBLIC_APP_URL?: string } | undefined)?.NEXT_PUBLIC_APP_URL;
    return typeof configured === "string" ? configured : null;
  } catch {
    return null;
  }
}
