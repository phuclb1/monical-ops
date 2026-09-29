import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { connectZaloAccount } from "@/lib/zalo-client";
import { loadZaloPublicStatus } from "@/lib/zalo-session";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

let connecting = false;

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return Response.json({ error: "Cần đăng nhập." }, { status: 401 });
  if (!can(user.role, "manageSettings")) return Response.json({ error: "Chỉ quản lý kết nối Zalo." }, { status: 403 });
  const status = await loadZaloPublicStatus();
  if (!status.phone) return Response.json({ error: "Hãy lưu số Zalo trước khi quét mã." }, { status: 400 });
  if (connecting) return Response.json({ error: "Đang chờ một mã QR khác. Hãy đợi hoặc tải lại trang." }, { status: 409 });

  connecting = true;
  const encoder = new TextEncoder();
  let retries = 0;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, string>) => {
        if (request.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        await connectZaloAccount(user.id, status.phone, {
          signal: request.signal,
          onQr: (image) => send({ status: "qr", image }),
          onScanned: (name) => send({ status: "scanned", name }),
          onExpired: () => {
            retries += 1;
            if (retries <= 2) return true;
            send({ status: "expired", message: "Mã QR hết hạn. Bấm kết nối lại." });
            return false;
          },
          onDeclined: () => send({ status: "declined", message: "Đã từ chối mã QR trên điện thoại." }),
        });
        if (!request.signal.aborted) send({ status: "done" });
      } catch (error) {
        if (request.signal.aborted) return;
        const message = error instanceof Error ? error.message : "";
        if (/abort/i.test(message)) return;
        send({ status: "error", message: message || "Không kết nối được Zalo." });
      } finally {
        connecting = false;
        try {
          controller.close();
        } catch {
          connecting = false;
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
