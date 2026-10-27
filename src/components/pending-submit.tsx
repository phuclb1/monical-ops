"use client";

import { createContext, useContext, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import { Btn } from "@/components/ui";

const NativePending = createContext(false);

type Variant = "primary" | "ghost" | "danger" | "gold";

export function NativePostForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const lock = useRef(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (pending || lock.current) {
      event.preventDefault();
      return;
    }
    lock.current = true;
    setPending(true);
  }

  return (
    <NativePending.Provider value={pending}>
      <form action={action} method="post" className={className} onSubmit={onSubmit} aria-busy={pending}>
        {children}
      </form>
    </NativePending.Provider>
  );
}

export function PendingSubmit({
  children,
  pendingLabel = "Đang xử lý...",
  variant = "primary",
  className,
  disabled,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
}) {
  const { pending: actionPending } = useFormStatus();
  const nativePending = useContext(NativePending);
  const pending = actionPending || nativePending;
  return (
    <Btn
      type="submit"
      variant={variant}
      className={clsx("disabled:cursor-progress", className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending ? pendingLabel : children}
    </Btn>
  );
}

export function PendingNative({
  children,
  pendingLabel = "Đang xử lý...",
  className,
  disabled,
  formAction,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={clsx(className, pending && "cursor-progress opacity-60")}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      formAction={formAction}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
