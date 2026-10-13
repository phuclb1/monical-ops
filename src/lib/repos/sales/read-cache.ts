const TTL_MS = 15_000;

let revision = 0;
const store = new Map<string, { rev: number; at: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();

export function bumpBookingReadCache() {
  revision += 1;
  store.clear();
  pending.clear();
}

export async function rememberBookingRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.rev === revision && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const rev = revision;
  const flight = `${rev}:${key}`;
  const existing = pending.get(flight);
  if (existing) return existing as Promise<T>;
  const promise = load()
    .then((value) => {
      if (rev === revision) store.set(key, { rev, at: Date.now(), value });
      return value;
    })
    .finally(() => {
      pending.delete(flight);
    });
  pending.set(flight, promise);
  return promise;
}
