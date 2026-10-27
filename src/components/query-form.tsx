"use client";

import { createContext, useContext, useEffect, useRef, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { searchHref } from "@/lib/search-href";
import { Btn } from "@/components/ui";

const QueryPending = createContext(false);

export function QueryForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const lock = useRef(false);

  useEffect(() => {
    if (!pending) lock.current = false;
  }, [pending]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || lock.current) return;
    lock.current = true;
    const href = searchHref(action, new FormData(event.currentTarget));
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <QueryPending.Provider value={pending}>
      <form action={action} method="get" className={className} onSubmit={onSubmit} aria-busy={pending}>
        {children}
      </form>
    </QueryPending.Provider>
  );
}

export function QuerySubmit({
  children,
  pendingLabel,
  variant = "ghost",
  className,
}: {
  children: ReactNode;
  pendingLabel: string;
  variant?: "primary" | "ghost" | "danger" | "gold";
  className?: string;
}) {
  const pending = useContext(QueryPending);
  return (
    <Btn
      type="submit"
      variant={variant}
      className={clsx("disabled:cursor-progress", className)}
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {pending ? pendingLabel : children}
    </Btn>
  );
}
