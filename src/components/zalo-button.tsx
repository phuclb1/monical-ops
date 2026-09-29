"use client";

import { sendZaloAction } from "@/actions/ops";
import { Btn } from "./ui";

export function ZaloShare({
  id,
  message,
  ready,
  groupName,
  senderPhone,
}: {
  id: string;
  message: string;
  ready: boolean;
  groupName: string;
  senderPhone: string;
}) {
  async function copy() {
    await navigator.clipboard.writeText(message);
    alert("Đã sao chép nội dung Zalo");
  }
  return (
    <div className="space-y-2">
      <pre className="whitespace-pre-wrap rounded-xl bg-[#f4efe6] p-3 text-[13px] leading-5">{message}</pre>
      <p className="text-xs leading-5 text-[#5c6665]">
        {senderPhone ? `Gửi từ ${senderPhone}` : "Chưa cấu hình số gửi"}
        {groupName ? ` vào nhóm ${groupName}` : ""}.
      </p>
      {ready ? (
        <form action={sendZaloAction}>
          <input type="hidden" name="id" value={id} />
          <Btn type="submit" className="w-full" variant="gold">
            Gửi vào nhóm Zalo
          </Btn>
        </form>
      ) : (
        <p className="text-sm text-[#5c6665]">Quản lý cần kết nối Zalo và chọn nhóm trong Cài đặt thì tin mới gửi được.</p>
      )}
      <Btn type="button" variant="ghost" className="w-full" onClick={copy}>
        Sao chép
      </Btn>
      <p className="text-[11px] text-[#6b7372]">Không gửi ảnh CCCD/hộ chiếu qua Zalo. Hồ sơ chính thức nằm trên web này.</p>
    </div>
  );
}
