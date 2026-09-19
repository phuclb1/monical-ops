const PREFIX = "ops:v1:";
const CURRENT_USER = `${PREFIX}user`;

export const BOARD_TTL_MS = {
  today: 30_000,
  rooms: 30_000,
  tasks: 30_000,
  sales: 30_000,
  kitchen: 30_000,
  unread: 15_000,
  catalog: 10 * 60_000,
} as const;

export type BoardName = keyof typeof BOARD_TTL_MS | (string & {});

function key(userId: string, board: string) {
  return `${PREFIX}${userId}:${board}`;
}

type Envelope<T> = { at: number; payload: T };

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readSnapshot<T>(userId: string, board: string, maxAgeMs?: number): T | null {
  if (!canUseStorage() || !userId) return null;
  try {
    const raw = localStorage.getItem(key(userId, board));
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (!env || typeof env.at !== "number") return null;
    if (maxAgeMs != null && Date.now() - env.at > maxAgeMs) return env.payload;
    return env.payload;
  } catch {
    return null;
  }
}

export function readFreshSnapshot<T>(userId: string, board: string, maxAgeMs: number): T | null {
  if (!canUseStorage() || !userId) return null;
  try {
    const raw = localStorage.getItem(key(userId, board));
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (!env || typeof env.at !== "number") return null;
    if (Date.now() - env.at > maxAgeMs) return null;
    return env.payload;
  } catch {
    return null;
  }
}

export function writeSnapshot(userId: string, board: string, payload: unknown) {
  if (!canUseStorage() || !userId) return;
  try {
    localStorage.setItem(key(userId, board), JSON.stringify({ at: Date.now(), payload }));
  } catch {
    // quota / private mode
  }
}

export function invalidateBoards(userId: string, boards: string[]) {
  if (!canUseStorage() || !userId) return;
  for (const board of boards) localStorage.removeItem(key(userId, board));
}

export function clearUserCache(userId: string) {
  if (!canUseStorage() || !userId) return;
  const needle = `${PREFIX}${userId}:`;
  const remove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(needle)) remove.push(k);
  }
  for (const k of remove) localStorage.removeItem(k);
}

export function rememberOpsUser(userId: string | null) {
  if (!canUseStorage()) return;
  const prev = localStorage.getItem(CURRENT_USER);
  if (prev && prev !== userId) clearUserCache(prev);
  if (userId) localStorage.setItem(CURRENT_USER, userId);
  else localStorage.removeItem(CURRENT_USER);
}

export function currentOpsUser() {
  if (!canUseStorage()) return null;
  return localStorage.getItem(CURRENT_USER);
}
