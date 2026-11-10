import { getSession } from "@/lib/auth";
import { tooManyRequests } from "@/lib/api-rate-limit";
import { takeRateLimit } from "@/lib/rate-limit";
import { can } from "@/lib/permissions";
import { loadZaloAgentJob, parseJobEvents } from "@/lib/zalo-agent-jobs";
import { startZaloLoginJob } from "@/lib/zalo-client";
import { loadZaloPublicStatus } from "@/lib/zalo-session";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return Response.json({ error: "Cần đăng nhập." }, { status: 401 });
  if (!can(user.role, "manageSettings")) return Response.json({ error: "Chỉ quản lý kết nối Zalo." }, { status: 403 });
  const limited = takeRateLimit(`zalo-connect:${user.id}`, 4, 60_000);
  if (!limited.ok) return tooManyRequests(limited, "Đang kết nối quá nhanh. Hãy đợi một lát.");
  const status = await loadZaloPublicStatus();
  if (!status.phone) return Response.json({ error: "Hãy lưu số Zalo trước khi quét mã." }, { status: 400 });

  const jobId = await startZaloLoginJob(user.id, status.phone);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, string>) => {
        if (request.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      let cursor = 0;
      let finished = false;
      try {
        send({ status: "wait", message: "Đang chờ máy local tạo mã QR..." });
        const deadline = Date.now() + 170_000;
        while (!request.signal.aborted && Date.now() < deadline) {
          const job = await loadZaloAgentJob(jobId);
          if (!job) {
            send({ status: "error", message: "Lệnh kết nối Zalo đã mất." });
            finished = true;
            break;
          }
          const events = parseJobEvents(job.events);
          while (cursor < events.length) {
            const event = events[cursor++];
            send({
              status: event.status,
              ...(event.image ? { image: event.image } : {}),
              ...(event.name ? { name: event.name } : {}),
              ...(event.message ? { message: event.message } : {}),
            });
            if (event.status === "error" || event.status === "expired" || event.status === "declined") finished = true;
          }
          if (job.status === "done") {
            send({ status: "done" });
            finished = true;
            break;
          }
          if (job.status === "failed") {
            send({ status: "error", message: job.error || "Máy local không kết nối được Zalo." });
            finished = true;
            break;
          }
          if (finished) break;
          await sleep(400);
        }
        if (!finished && !request.signal.aborted) {
          send({ status: "error", message: "Hết thời gian chờ máy local. Kiểm tra agent Zalo trên Mac." });
        }
      } catch (error) {
        if (!request.signal.aborted) {
          const message = error instanceof Error ? error.message : "";
          send({ status: "error", message: message || "Không kết nối được Zalo." });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // stream already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
