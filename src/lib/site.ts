export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ops-monical.phuclb1.workers.dev";

export function absoluteUrl(path: string) {
  return new URL(path, `${SITE_URL.replace(/\/$/, "")}/`).toString();
}
