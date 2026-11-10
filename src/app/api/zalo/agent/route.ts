import {
  appendZaloAgentEvent,
  claimZaloAgentJobs,
  finishZaloAgentJob,
  touchZaloAgentSeen,
  type ZaloAgentEvent,
} from "@/lib/zalo-agent-jobs";
import {
  agentCredentials,
  claimZaloOutbox,
  finishZaloOutbox,
  parseAgentCredentials,
  rememberAgentCredentials,
  tokenMatches,
} from "@/lib/zalo-outbox";
import { normalizeZaloPhone, zaloPhonesMatch } from "@/lib/zalo";
import { saveZaloLogin } from "@/lib/zalo-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await authorized(request))) return Response.json({ ok: false }, { status: 403 });
  await touchZaloAgentSeen();
  const [credentials, jobs, commands] = await Promise.all([agentCredentials(), claimZaloOutbox(), claimZaloAgentJobs()]);
  return Response.json({ ok: true, credentials, jobs, commands });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return Response.json({ ok: false }, { status: 403 });
  await touchZaloAgentSeen();
  const body = (await request.json().catch(() => null)) as {
    type?: string;
    kind?: string;
    id?: string;
    claimId?: string;
    ok?: boolean;
    error?: string;
    event?: ZaloAgentEvent;
    result?: unknown;
    credentials?: unknown;
  } | null;
  const id = String(body?.id || "");
  const claimId = String(body?.claimId || "");
  if (!id || !claimId) return Response.json({ ok: false }, { status: 400 });

  if (body?.type === "job_event") {
    const event = body.event;
    if (!event || typeof event.status !== "string") return Response.json({ ok: false }, { status: 400 });
    const saved = await appendZaloAgentEvent(id, claimId, {
      status: event.status,
      image: event.image ? String(event.image) : undefined,
      name: event.name ? String(event.name) : undefined,
      message: event.message ? String(event.message) : undefined,
    });
    return Response.json({ ok: saved });
  }

  if (body?.type === "job_done") {
    const credentials = parseAgentCredentials(body?.credentials);
    const kind = String(body?.kind || "");
    if (body?.ok && kind === "login_qr" && credentials) {
      const result = (body.result || {}) as {
        accountName?: string;
        accountUid?: string;
        accountPhone?: string;
        phone?: string;
      };
      const expectedPhone = normalizeZaloPhone(String(result.phone || ""));
      const accountPhone = normalizeZaloPhone(String(result.accountPhone || ""));
      if (expectedPhone && accountPhone && !zaloPhonesMatch(accountPhone, expectedPhone)) {
        await finishZaloAgentJob(id, claimId, false, null, `Tài khoản vừa quét không khớp số ${expectedPhone}.`);
        return Response.json({ ok: false });
      }
      await saveZaloLogin("zalo-agent", {
        credentials,
        accountName: String(result.accountName || ""),
        accountUid: String(result.accountUid || ""),
        accountPhone: accountPhone || expectedPhone,
      });
    } else if (credentials) {
      await rememberAgentCredentials(credentials).catch((error) => console.error("zalo agent cookie", error));
    }
    const saved = await finishZaloAgentJob(id, claimId, Boolean(body?.ok), body?.result ?? null, String(body?.error || ""));
    return Response.json({ ok: saved });
  }

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
