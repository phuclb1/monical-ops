function toHex(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export const PASSWORD_MIN_LENGTH = 8;
// Cloudflare Workers Web Crypto currently rejects PBKDF2 counts above 100,000.
const PBKDF2_ITERATIONS = 100_000;
export const PASSWORD_REQUIREMENTS =
  "Ít nhất 8 ký tự, gồm chữ in hoa, chữ in thường, số và ký tự đặc biệt";

export function passwordValidationError(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_REQUIREMENTS;
  if (!/[a-z]/.test(password)) return PASSWORD_REQUIREMENTS;
  if (!/[A-Z]/.test(password)) return PASSWORD_REQUIREMENTS;
  if (!/[0-9]/.test(password)) return PASSWORD_REQUIREMENTS;
  if (!/[^A-Za-z0-9]/.test(password)) return PASSWORD_REQUIREMENTS;
  return null;
}

export async function hashPassword(password: string) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(bits)}`;
}

export function passwordNeedsRehash(stored: string) {
  const [algo, iter] = stored.split("$");
  return algo !== "pbkdf2" || Number(iter) < PBKDF2_ITERATIONS;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, iter, saltHex, hashHex] = stored.split("$");
  if (algo !== "pbkdf2" || !iter || !saltHex || !hashHex) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex), iterations: Number(iter), hash: "SHA-256" },
    key,
    256,
  );
  const got = toHex(bits);
  if (got.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}
