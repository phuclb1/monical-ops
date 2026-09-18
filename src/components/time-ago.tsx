"use client";

import { useEffect, useState } from "react";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";

export function TimeAgo({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() => formatDateTime(iso));
  useEffect(() => {
    setLabel(formatRelativeTime(iso));
  }, [iso]);
  return <span className="text-[11px] font-medium text-[#8a7a72]">{label}</span>;
}
