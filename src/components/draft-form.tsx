"use client";

import { useEffect, useRef } from "react";

export function DraftForm({
  id,
  children,
  action,
}: {
  id: string;
  children: React.ReactNode;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const raw = localStorage.getItem(`draft:${id}`);
    if (raw) {
      const data = JSON.parse(raw) as Record<string, string>;
      for (const [k, v] of Object.entries(data)) {
        const el = form.elements.namedItem(k);
        if (el && "value" in el && !el.value) el.value = v;
      }
    }
    const save = () => {
      const fd = new FormData(form);
      const obj: Record<string, string> = {};
      for (const [k, v] of fd.entries()) {
        if (typeof v === "string") obj[k] = v;
      }
      localStorage.setItem(`draft:${id}`, JSON.stringify(obj));
    };
    form.addEventListener("input", save);
    const online = () => {
      if (navigator.onLine) {
        const queued = JSON.parse(localStorage.getItem("ops-queue") || "[]") as string[];
        if (queued.length) localStorage.setItem("ops-queue", "[]");
      }
    };
    window.addEventListener("online", online);
    return () => {
      form.removeEventListener("input", save);
      window.removeEventListener("online", online);
    };
  }, [id]);

  return (
    <form
      ref={ref}
      action={async (fd) => {
        localStorage.removeItem(`draft:${id}`);
        await action(fd);
      }}
    >
      {children}
    </form>
  );
}
