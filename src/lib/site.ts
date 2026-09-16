export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://platform.monicalhoteldalat.com";

export function absoluteUrl(path: string) {
  return new URL(path, `${SITE_URL.replace(/\/$/, "")}/`).toString();
}
