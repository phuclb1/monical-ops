import type { Credentials } from "zca-js";
import {
  loadZaloCredentials,
  saveZaloCookies,
  saveZaloLogin,
  type ZaloCredentials,
} from "@/lib/zalo-session";
import { normalizeZaloPhone, zaloPhonesMatch } from "@/lib/zalo";
import { zaloOutbound } from "@/lib/zalo-templates";

const ZALO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";

type ZaloApi = {
  getCookie: () => { serialize: () => Promise<{ cookies: unknown[] }> };
  keepAlive: () => Promise<unknown>;
  fetchAccountInfo: () => Promise<{ profile: { displayName?: string; phoneNumber?: string; userId?: string } }>;
  getAllGroups: () => Promise<{ gridVerMap: Record<string, string> }>;
  getGroupInfo: (groupId: string | string[]) => Promise<{
    removedsGroup?: string[];
    gridInfoMap?: Record<string, { name?: string; totalMember?: number }>;
  }>;
  sendMessage: (message: string, threadId: string, type?: number) => Promise<unknown>;
};

export type ZaloGroupOption = { id: string; name: string; members: number };

export async function connectZaloAccount(
  actorId: string,
  configuredPhone: string,
  handlers: {
    onQr: (image: string) => void;
    onScanned: (name: string) => void;
    onExpired: () => boolean;
    onDeclined: () => void;
    signal?: AbortSignal;
  },
) {
  const { Zalo, LoginQRCallbackEventType } = await import("zca-js");
  const zalo = new Zalo({ logging: false, checkUpdate: false });
  let abort: (() => void) | null = null;
  let device: { imei: string; userAgent: string } | null = null;
  let scannedName = "";
  const onAbort = () => abort?.();
  handlers.signal?.addEventListener("abort", onAbort);
  try {
    const api = await zalo.loginQR({ userAgent: ZALO_UA, language: "vi" }, (event) => {
      if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
        abort = event.actions.abort;
        handlers.onQr(event.data.image);
      } else if (event.type === LoginQRCallbackEventType.QRCodeScanned) {
        scannedName = event.data.display_name || "";
        handlers.onScanned(scannedName);
      } else if (event.type === LoginQRCallbackEventType.QRCodeExpired) {
        if (handlers.onExpired()) event.actions.retry();
        else event.actions.abort();
      } else if (event.type === LoginQRCallbackEventType.QRCodeDeclined) {
        handlers.onDeclined();
        event.actions.abort();
      } else if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
        device = { imei: event.data.imei, userAgent: event.data.userAgent };
      }
    });
    if (!api || !device) throw new Error("Không nhận được phiên Zalo sau khi quét mã.");
    if (handlers.signal?.aborted) return;
    const profile = await readProfile(api as ZaloApi);
    const accountPhone = normalizeZaloPhone(profile.phoneNumber || "");
    if (accountPhone && !zaloPhonesMatch(accountPhone, configuredPhone)) {
      throw new Error(`Tài khoản vừa quét không khớp số ${normalizeZaloPhone(configuredPhone)}. Quét bằng đúng số đã lưu.`);
    }
    const credentials = await credentialsFrom(api as ZaloApi, device);
    await saveZaloLogin(actorId, {
      credentials,
      accountName: profile.displayName || scannedName,
      accountUid: profile.userId || "",
      accountPhone: accountPhone || configuredPhone,
    });
  } finally {
    handlers.signal?.removeEventListener("abort", onAbort);
  }
}

export async function listZaloGroups(actorId: string) {
  return withZaloSession(actorId, async (api) => {
    const all = await api.getAllGroups();
    const ids = Object.keys(all.gridVerMap || {});
    const groups: ZaloGroupOption[] = [];
    for (let index = 0; index < ids.length; index += 40) {
      const info = await api.getGroupInfo(ids.slice(index, index + 40));
      for (const [id, group] of Object.entries(info.gridInfoMap || {})) {
        groups.push({ id, name: group.name || "Nhóm không tên", members: group.totalMember || 0 });
      }
    }
    groups.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    return groups;
  });
}

export async function rememberZaloGroup(actorId: string, groupId: string) {
  return withZaloSession(actorId, async (api) => {
    const info = await api.getGroupInfo(groupId);
    if (info.removedsGroup?.includes(groupId)) throw new Error("Nhóm này không còn trên Zalo.");
    const group = info.gridInfoMap?.[groupId];
    if (!group) throw new Error("Không tìm thấy nhóm trên tài khoản Zalo đã kết nối.");
    return { id: groupId, name: group.name || "Nhóm không tên" };
  });
}

export async function sendZaloToGroup(actorId: string, groupId: string, message: string) {
  return withZaloSession(actorId, async (api) => {
    await api.keepAlive().catch(() => undefined);
    const { ThreadType } = await import("zca-js");
    await api.sendMessage(zaloOutbound(message), groupId, ThreadType.Group);
  });
}

async function withZaloSession<T>(actorId: string, run: (api: ZaloApi) => Promise<T>) {
  const stored = await loadZaloCredentials();
  if (!stored) throw new Error("Quản lý chưa kết nối Zalo trong Cài đặt.");
  const { Zalo } = await import("zca-js");
  const zalo = new Zalo({ logging: false, checkUpdate: false });
  let api: ZaloApi | null = null;
  try {
    api = (await zalo.login({
      imei: stored.credentials.imei,
      userAgent: stored.credentials.userAgent,
      language: stored.credentials.language,
      cookie: stored.credentials.cookies as Credentials["cookie"],
    })) as ZaloApi;
  } catch {
    throw new Error("Phiên Zalo đã hết hạn. Quản lý cần quét lại mã QR trong Cài đặt.");
  }
  try {
    return await run(api);
  } finally {
    await rememberCookies(actorId, stored.credentials, api).catch((error) => {
      console.error("zalo cookie save failed", error);
    });
  }
}

async function rememberCookies(actorId: string, previous: ZaloCredentials, api: ZaloApi) {
  const next = await credentialsFrom(api, { imei: previous.imei, userAgent: previous.userAgent });
  await saveZaloCookies(actorId, { ...next, language: previous.language });
}

async function credentialsFrom(api: ZaloApi, device: { imei: string; userAgent: string }): Promise<ZaloCredentials> {
  const jar = await api.getCookie().serialize();
  if (!jar.cookies?.length) throw new Error("Zalo không trả cookie để lưu phiên.");
  return {
    imei: device.imei,
    userAgent: device.userAgent,
    language: "vi",
    cookies: jar.cookies,
  };
}

async function readProfile(api: ZaloApi) {
  try {
    const info = await api.fetchAccountInfo();
    return info.profile || {};
  } catch {
    return {};
  }
}
