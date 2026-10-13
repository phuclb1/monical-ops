import { agentCredentials, claimZaloOutbox, finishZaloOutbox, parseAgentCredentials, rememberAgentCredentials, tokenMatches } from "@/lib/zalo-outbox";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await authorized(request))) return Response.json({ ok: false }, { status: 403 });
  const [credentials, jobs] = await Promise.all([agentCredentials(), claimZaloOutbox()]);
  return Response.json({ ok: true, credentials, jobs });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return Response.json({ ok: false }, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    claimId?: string;
    ok?: boolean;
    error?: string;
    credentials?: unknown;
  } | null;
  const id = String(body?.id || "");
  const claimId = String(body?.claimId || "");
  if (!id || !claimId) return Response.json({ ok: false }, { status: 400 });
  const saved = await finishZaloOutbox(id, claimId, Boolean(body?.ok), String(body?.error || ""));
  const credentials = parseAgentCredentials(body?.credentials);
  if (credentials) await rememberAgentCredentials(credentials).catch((error) => console.error("zalo agent cookie", error));
  return Response.json({ ok: saved });
}

async function authorized(request: Request) {
  const expected = await agentToken();
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return tokenMatches(expected, provided);
}

async function agentToken() {
  const fromProcess = process.env.ZALO_AGENT_TOKEN;
  if (fromProcess) return fromProcess;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const value = (env as { ZALO_AGENT_TOKEN?: string } | undefined)?.ZALO_AGENT_TOKEN;
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}
