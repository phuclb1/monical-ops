"use client";

import { useState } from "react";
import { Field } from "./ui";

export function ExpensePayerField({ labels }: { labels: string[] }) {
  const [choice, setChoice] = useState("");
  const [custom, setCustom] = useState("");
  const creating = labels.length === 0 || choice === "__new__";
  const spentBy = creating ? custom : choice;

  return (
    <>
      <input type="hidden" name="spentBy" value={spentBy} />
      <Field label="Ai chi">
        {labels.length > 0 ? (
          <select value={choice} required={!creating} onChange={(event) => setChoice(event.target.value)}>
            <option value="" disabled>
              Chọn người chi
            </option>
            {labels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
            <option value="__new__">Nhập tên mới</option>
          </select>
        ) : (
          <input
            value={custom}
            maxLength={80}
            required
            placeholder="Nhập tên người chi"
            onChange={(event) => setCustom(event.target.value)}
          />
        )}
      </Field>
      {labels.length > 0 && creating ? (
        <Field label="Tên mới">
          <input
            value={custom}
            maxLength={80}
            required
            placeholder="Nhập tên người chi"
            onChange={(event) => setCustom(event.target.value)}
          />
        </Field>
      ) : null}
    </>
  );
}
