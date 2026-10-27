export type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number };

export const RATE_LIMIT_MESSAGE = "Thao tác vừa gửi. Hãy đợi một chút rồi thử lại.";

export function createRateLimiter(now: () => number = () => Date.now()) {
  const hits = new Map<string, number[]>();
  const claims = new Map<string, number>();

  return {
    take(key: string, limit: number, windowMs: number): RateLimitResult {
      const t = now();
      const fresh = (hits.get(key) ?? []).filter((stamp) => t - stamp < windowMs);
      if (fresh.length >= limit) {
        hits.set(key, fresh);
        return { ok: false, retryAfterMs: Math.max(0, windowMs - (t - fresh[0])) };
      }
      fresh.push(t);
      hits.set(key, fresh);
      return { ok: true };
    },
    claim(key: string, windowMs: number) {
      const t = now();
      const until = claims.get(key) ?? 0;
      if (until > t) return false;
      claims.set(key, t + windowMs);
      if (claims.size > 2000) {
        for (const [id, expiry] of claims) {
          if (expiry <= t) claims.delete(id);
        }
      }
      return true;
    },
  };
}

const limiter = createRateLimiter();

export function takeRateLimit(key: string, limit: number, windowMs: number) {
  return limiter.take(key, limit, windowMs);
}

export function claimAction(key: string, windowMs = 800) {
  return limiter.claim(key, windowMs);
}

export function assertActionPace(userId: string, action: string, target = "", windowMs = 800) {
  if (!claimAction(`${action}:${userId}:${target}`, windowMs)) {
    throw new Error(RATE_LIMIT_MESSAGE);
  }
}
