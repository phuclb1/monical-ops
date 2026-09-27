type HeaderReader = { get(name: string): string | null };

export type ReceptionIpPolicy = { enabled: boolean; ip: string | null };

export function normalizeIp(value: string | null | undefined) {
  const ip = value?.trim().toLowerCase() ?? "";
  if (!ip) return null;
  return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
}

export function isValidIp(value: string | null | undefined) {
  const ip = normalizeIp(value);
  if (!ip) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return ip.split(".").every((part) => Number(part) <= 255);
  }
  return ip.includes(":") && /^[0-9a-f:]+$/.test(ip);
}

export function policyFromEnv(): ReceptionIpPolicy {
  const ip = normalizeIp(process.env.RECEPTION_ALLOWED_IP);
  return { enabled: Boolean(ip), ip };
}

function isPrivateIp(ip: string) {
  if (ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) {
    return true;
  }
  const [first, second] = ip.split(".").map(Number);
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) return true;
  return false;
}

export function clientIp(headers: HeaderReader) {
  const forwarded = headers.get("x-forwarded-for")?.split(",") ?? [];
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("true-client-ip"),
    ...forwarded,
    headers.get("x-real-ip"),
  ]
    .map((value) => normalizeIp(value))
    .filter((value): value is string => Boolean(value));
  return candidates.find((ip) => !isPrivateIp(ip)) ?? candidates[0] ?? null;
}

export function receptionIpBlocked(role: string, headers: HeaderReader, policy: ReceptionIpPolicy = policyFromEnv()) {
  if (role !== "reception" || !policy.enabled) return false;
  const allowed = normalizeIp(policy.ip);
  if (!allowed) return true;
  return clientIp(headers) !== allowed;
}
