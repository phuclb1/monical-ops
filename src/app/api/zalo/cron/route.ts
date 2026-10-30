import { runDueZaloSchedules } from "@/lib/zalo-notify";
import { runControlAuditPush } from "@/lib/repos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expected = await cronToken();
  const provided = request.headers.get("x-zalo-cron") || "";
  if (!expected || provided !== expected) {
    return Response.json({ ok: false }, { status: 403 });
  }
  const [sent, control] = await Promise.all([
    runDueZaloSchedules(),
    runControlAuditPush(),
  ]);
  return Response.json({ ok: true, sent, control });
}

async function cronToken() {
  const fromProcess = process.env.ZALO_CRON_TOKEN;
  if (fromProcess) return fromProcess;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const value = (env as { ZALO_CRON_TOKEN?: string } | undefined)?.ZALO_CRON_TOKEN;
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}
