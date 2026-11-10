import {
  enqueueZaloAgentJob,
  parseGroupList,
  waitZaloAgentJob,
  type ZaloGroupOption,
} from "@/lib/zalo-agent-jobs";
import { enqueueZaloOutbox } from "@/lib/zalo-outbox";
import { loadZaloCredentials, zaloMessagingEnabled } from "@/lib/zalo-session";
import { zaloOutbound } from "@/lib/zalo-templates";

export type { ZaloGroupOption };

export async function sendZaloToGroup(actorId: string, groupId: string, message: string) {
  if (!(await zaloMessagingEnabled())) throw new Error("Đang tắt gửi tin Zalo.");
  const stored = await loadZaloCredentials();
  if (!stored) throw new Error("Quản lý chưa kết nối Zalo trong Cài đặt.");
  await enqueueZaloOutbox(actorId, groupId, zaloOutbound(message));
}

export async function startZaloLoginJob(actorId: string, phone: string) {
  return enqueueZaloAgentJob(actorId, "login_qr", { phone });
}

export async function listZaloGroups(actorId: string) {
  const stored = await loadZaloCredentials();
  if (!stored) throw new Error("Quản lý chưa kết nối Zalo trong Cài đặt.");
  const id = await enqueueZaloAgentJob(actorId, "list_groups", {});
  return waitZaloAgentJob(id, (row) => parseGroupList(row.result));
}
