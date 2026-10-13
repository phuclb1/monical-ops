import { nowISO } from "@/lib/datetime";
import { isMachineBookingActor, serializeOpenBooking, type OpenBooking } from "@/lib/open-api";
import { loadOpenApiWebhookConfig } from "@/lib/open-api-settings";
import { getBooking } from "@/lib/repos/sales/queries";
import type { SessionUser } from "@/lib/types";

export const BOOKING_WEBHOOK_EVENTS = [
  "booking.created",
  "booking.room_changed",
  "booking.dates_changed",
  "booking.rooms_added",
] as const;

export type BookingWebhookEvent = (typeof BOOKING_WEBHOOK_EVENTS)[number];

export type BookingWebhookRoom = {
  saleId: string;
  roomId: string;
  roomNumber?: string | null;
  checkIn: string;
  checkOut: string;
};

export type BookingWebhookChanges = {
  rooms: { saleId: string; from: string | null; to: string | null }[];
  dates: { saleId: string; from: { checkIn: string; checkOut: string }; to: { checkIn: string; checkOut: string } }[];
  addedRooms: BookingWebhookRoom[];
  removedRooms: BookingWebhookRoom[];
};

export type BookingWebhookPayload = {
  event: BookingWebhookEvent;
  events: BookingWebhookEvent[];
  at: string;
  actor: { id: string; name: string };
  bookingId: string;
  pmsCode: string | null;
  changes: BookingWebhookChanges;
  booking: OpenBooking;
};

export function bookingWebhookRooms(
  booking: {
    rooms: { id: string; roomId: string; checkIn: string; checkOut: string; room?: { number?: string } | null }[];
  },
): BookingWebhookRoom[] {
  return booking.rooms.map((row) => ({
    saleId: row.id,
    roomId: row.roomId,
    roomNumber: row.room?.number ?? null,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
  }));
}

export function bookingWebhookDiff(
  before: BookingWebhookRoom[] | null | undefined,
  after: BookingWebhookRoom[],
): { events: BookingWebhookEvent[]; changes: BookingWebhookChanges } {
  const changes: BookingWebhookChanges = { rooms: [], dates: [], addedRooms: [], removedRooms: [] };
  if (!before) {
    return {
      events: ["booking.created"],
      changes: { ...changes, addedRooms: after },
    };
  }
  const prev = new Map(before.map((row) => [row.saleId, row]));
  const next = new Map(after.map((row) => [row.saleId, row]));
  for (const row of after) {
    if (!prev.has(row.saleId)) changes.addedRooms.push(row);
  }
  for (const row of before) {
    if (!next.has(row.saleId)) changes.removedRooms.push(row);
  }
  for (const row of after) {
    const old = prev.get(row.saleId);
    if (!old) continue;
    if (old.roomId !== row.roomId) {
      changes.rooms.push({
        saleId: row.saleId,
        from: old.roomNumber || old.roomId,
        to: row.roomNumber || row.roomId,
      });
    }
    if (old.checkIn !== row.checkIn || old.checkOut !== row.checkOut) {
      changes.dates.push({
        saleId: row.saleId,
        from: { checkIn: old.checkIn, checkOut: old.checkOut },
        to: { checkIn: row.checkIn, checkOut: row.checkOut },
      });
    }
  }
  const events: BookingWebhookEvent[] = [];
  if (changes.addedRooms.length) events.push("booking.rooms_added");
  if (changes.rooms.length || changes.removedRooms.length) events.push("booking.room_changed");
  if (changes.dates.length) events.push("booking.dates_changed");
  return { events, changes };
}

export async function bookingWebhookConfig() {
  try {
    const stored = await loadOpenApiWebhookConfig();
    if (stored.url) {
      return {
        url: stored.url,
        secret: stored.secret || (await runtimeEnv("CODEX_WEBHOOK_SECRET")) || (await runtimeEnv("AGENT_WEBHOOK_SECRET")),
      };
    }
  } catch {
    // local tests / DB chưa sẵn
  }
  return {
    url: (await runtimeEnv("CODEX_WEBHOOK_URL")) || (await runtimeEnv("AGENT_WEBHOOK_URL")),
    secret: (await runtimeEnv("CODEX_WEBHOOK_SECRET")) || (await runtimeEnv("AGENT_WEBHOOK_SECRET")),
  };
}

export async function signBookingWebhook(secret: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return `sha256=${[...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function dispatchBookingWebhook(input: {
  actor: SessionUser;
  bookingId: string;
  events?: BookingWebhookEvent[];
  beforeRooms?: BookingWebhookRoom[] | null;
}) {
  if (isMachineBookingActor(input.actor.id)) return { skipped: "actor" as const };
  const config = await bookingWebhookConfig();
  if (!config.url) return { skipped: "unconfigured" as const };
  const booking = await getBooking(input.bookingId);
  if (!booking) return { skipped: "missing" as const };
  const afterRooms = bookingWebhookRooms(booking);
  const diff = bookingWebhookDiff(input.beforeRooms, afterRooms);
  const events = input.events?.length ? input.events : diff.events;
  if (!events.length) return { skipped: "no-change" as const };
  const payload: BookingWebhookPayload = {
    event: events[0],
    events,
    at: nowISO(),
    actor: { id: input.actor.id, name: input.actor.fullName },
    bookingId: booking.id,
    pmsCode: booking.pmsCode,
    changes: diff.changes,
    booking: serializeOpenBooking(booking),
  };
  const job = postBookingWebhook(config, payload).catch((error) => console.error("booking webhook", error));
  await scheduleBackground(job);
  return { ok: true as const, events };
}

export async function postBookingWebhook(
  config: { url: string; secret: string },
  payload: BookingWebhookPayload,
  fetchImpl: typeof fetch = fetch,
) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "ops-monical-webhook",
    "x-ops-event": payload.event,
  };
  if (config.secret) {
    headers["x-ops-timestamp"] = timestamp;
    headers["x-ops-signature"] = await signBookingWebhook(config.secret, timestamp, body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(config.url, { method: "POST", headers, body, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Webhook ${response.status} ${await response.text().catch(() => "")}`.trim());
    }
    return { ok: true as const, status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

async function scheduleBackground(job: Promise<unknown>) {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = await getCloudflareContext({ async: true });
    if (ctx?.waitUntil) {
      ctx.waitUntil(job);
      return;
    }
  } catch {
    // local next dev
  }
  await job;
}

async function runtimeEnv(key: string) {
  const fromProcess = process.env[key]?.trim();
  if (fromProcess) return fromProcess;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const bag = env as { CODEX_WEBHOOK_URL?: string; AGENT_WEBHOOK_URL?: string; CODEX_WEBHOOK_SECRET?: string; AGENT_WEBHOOK_SECRET?: string } | undefined;
    const value = bag?.[key as keyof NonNullable<typeof bag>];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}
