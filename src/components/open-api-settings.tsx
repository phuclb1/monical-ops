"use client";

import { useActionState, useState } from "react";
import { generateOpenApiTokenAction, revokeOpenApiTokenAction } from "@/actions/settings";
import { Btn, Field } from "@/components/ui";

type Issued = { token?: string; webhookSecret?: string; error?: string } | null;

export function OpenApiTokenPanel({ hasToken, hint }: { hasToken: boolean; hint: string }) {
  const [issued, action, pending] = useActionState(generateOpenApiTokenAction, null);
  const [copied, setCopied] = useState("");

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
  }

  return (
    <div className="space-y-3">
      {hasToken && !issued?.token ? (
        <p className="text-sm">
          Token hiện tại: <span className="font-semibold">{hint}</span>
        </p>
      ) : null}
      {!hasToken && !issued?.token ? <p className="text-sm text-[#5c6665]">Chưa có token. Tạo một lần rồi dán vào agent Codex.</p> : null}

      {issued?.error ? <p className="text-sm font-medium text-[#c23b3b]">{issued.error}</p> : null}
      {issued?.token ? (
        <div className="space-y-2 rounded-xl bg-[#f4efe6] p-3">
          <p className="text-xs font-semibold text-[#9a5b00]">Sao chép ngay. Token đầy đủ chỉ hiện lần này.</p>
          <Field label="API token">
            <input readOnly value={issued.token} />
          </Field>
          <Btn type="button" variant="ghost" className="w-full" onClick={() => copy(issued.token || "", "token")}>
            {copied === "token" ? "Đã sao chép token" : "Sao chép token"}
          </Btn>
          {issued.webhookSecret ? (
            <>
              <Field label="Secret ký webhook">
                <input readOnly value={issued.webhookSecret} />
              </Field>
              <Btn type="button" variant="ghost" className="w-full" onClick={() => copy(issued.webhookSecret || "", "secret")}>
                {copied === "secret" ? "Đã sao chép secret" : "Sao chép secret webhook"}
              </Btn>
            </>
          ) : null}
        </div>
      ) : null}

      <form
        action={action}
        onSubmit={(event) => {
          if (hasToken && !window.confirm("Token đang dùng sẽ hết hiệu lực ngay. Agent phải dán token mới.")) {
            event.preventDefault();
          }
        }}
      >
        <Btn type="submit" className="w-full" disabled={pending}>
          {pending ? "Đang tạo…" : hasToken || issued?.token ? "Tạo lại token" : "Tạo API token"}
        </Btn>
      </form>

      {hasToken || issued?.token ? (
        <form
          action={revokeOpenApiTokenAction}
          onSubmit={(event) => {
            if (!window.confirm("Xóa token? Agent sẽ không gọi được Open API cho đến khi tạo token mới.")) {
              event.preventDefault();
            }
          }}
        >
          <Btn type="submit" variant="ghost" className="w-full">
            Xóa token
          </Btn>
        </form>
      ) : null}
    </div>
  );
}
