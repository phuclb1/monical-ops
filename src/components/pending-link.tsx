"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

export function PendingLink({
  href,
  className,
  children,
  pendingLabel = "Đang tải...",
  current,
  prefetch,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  pendingLabel?: string;
  current?: boolean;
  prefetch?: boolean;
}) {
  return (
    <Link href={href} className={className} aria-current={current ? "page" : undefined} prefetch={prefetch}>
      <PendingBody pendingLabel={pendingLabel}>{children}</PendingBody>
    </Link>
  );
}

function PendingBody({ children, pendingLabel }: { children: ReactNode; pendingLabel?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className={pending ? "is-pending" : undefined} aria-busy={pending || undefined}>
      {pending && pendingLabel ? pendingLabel : children}
    </span>
  );
}
