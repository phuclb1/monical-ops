import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deletePushSubscription, savePushSubscription, vapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ publicKey: vapidPublicKey() });
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const body = (await request.json()) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "subscription" }, { status: 400 });
  }
  await savePushSubscription(user.id, { endpoint: body.endpoint, keys: body.keys }, request.headers.get("user-agent"));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
  await deletePushSubscription(user.id, body.endpoint);
  return NextResponse.json({ ok: true });
}
