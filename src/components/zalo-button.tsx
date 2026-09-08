"use client";

import { zaloSentAction } from "@/actions/ops";
import { zaloShareUrl } from "@/lib/zalo";
import { Btn } from "./ui";

export function ZaloShare({ id, message }: { id: string; message: string }) {
  async function copy() {
    await navigator.clipboard.writeText(message);
    alert("Đã sao chép nội dung Zalo");
  }
  return (
    <div className="space-y-2">
      <pre className="whitespace-pre-wrap rounded-xl bg-[#f4efe6] p-3 text-[13px] leading-5">{message}</pre>
      <div className="grid grid-cols-2 gap-2">
        <a href={zaloShareUrl(message)} target="_blank" rel="noreferrer">
          <Btn type="button" className="w-full" variant="gold">
            Gửi qua Zalo
          </Btn>
        </a>
        <Btn type="button" variant="ghost" className="w-full" onClick={copy}>
          Sao chép
        </Btn>
      </div>
      <form action={zaloSentAction}>
        <input type="hidden" name="id" value={id} />
        <Btn type="submit" variant="ghost" className="w-full">
          Đánh dấu đã gửi Zalo
        </Btn>
      </form>
      <p className="text-[11px] text-[#6b7372]">Không gửi ảnh CCCD/hộ chiếu qua Zalo. Hồ sơ chính thức nằm trên web này.</p>
    </div>
  );
}
