import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx("card p-4", className)}>{children}</section>;
}

export function Fold({
  title,
  hint,
  children,
  defaultOpen,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="card p-4" open={defaultOpen}>
      <summary className="fold-summary flex min-h-11 cursor-pointer items-center justify-between gap-2 font-bold">
        <span>{title}</span>
        {hint ? <span className="text-xs font-semibold text-[#5c6665]">{hint}</span> : null}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-end justify-between">
      <h2 className="text-[15px] font-bold text-ink">{children}</h2>
      {hint ? <span className="text-xs text-teal">{hint}</span> : null}
    </div>
  );
}

export function TabChip({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={clsx("tab-chip", active && "is-on")} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "gold" | "teal";
}) {
  const map = {
    neutral: "bg-[#eee8dc] text-[#4d5554]",
    ok: "bg-[#e4f5eb] text-[#1b7a4e]",
    warn: "bg-[#fff1d6] text-[#9a5b00]",
    danger: "bg-[#fde8e8] text-[#c23b3b]",
    gold: "bg-[#f7edd2] text-[#8a6a22]",
    teal: "bg-[#dceeee] text-[#0f4c4c]",
  };
  return <span className={clsx("chip", map[tone])}>{children}</span>;
}

export function Btn({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "gold" }) {
  const map = {
    primary: "bg-teal text-white",
    ghost: "bg-white text-teal border border-line",
    danger: "bg-[#c23b3b] text-white",
    gold: "bg-gold text-[#2b230f]",
  };
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold disabled:opacity-50 active:brightness-95",
        map[variant],
        props.className,
      )}
    >
      {children}
    </button>
  );
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-3 py-6 text-center">
      <p className="font-semibold">{title}</p>
      {text ? <p className="mt-1 text-sm text-[#5c6665]">{text}</p> : null}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#5c6665]">{label}</span>
      {children}
    </label>
  );
}

export function PayMethodField({
  name = "paymentMethod",
  value,
  onChange,
}: {
  name?: string;
  value?: "cash" | "transfer";
  onChange?: (value: "cash" | "transfer") => void;
}) {
  const current = value || "transfer";
  return (
    <fieldset>
      <legend className="mb-1.5 block text-xs font-semibold text-[#5c6665]">Hình thức</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className="min-h-11 rounded-xl border border-line bg-white px-3 text-sm font-semibold">
          <input
            type="radio"
            name={name}
            value="transfer"
            {...(onChange
              ? { checked: current === "transfer", onChange: () => onChange("transfer") }
              : { defaultChecked: current === "transfer" })}
          />
          Chuyển khoản
        </label>
        <label className="min-h-11 rounded-xl border border-line bg-white px-3 text-sm font-semibold">
          <input
            type="radio"
            name={name}
            value="cash"
            {...(onChange
              ? { checked: current === "cash", onChange: () => onChange("cash") }
              : { defaultChecked: current === "cash" })}
          />
          Tiền mặt
        </label>
      </div>
    </fieldset>
  );
}

export function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="card flex flex-col gap-1 p-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7372]">{label}</span>
      <span className={clsx("text-2xl font-bold", tone)}>{value}</span>
    </div>
  );
}
