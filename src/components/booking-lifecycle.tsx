import { Chip } from "@/components/ui";
import { bookingLifeChip, type BookingLifecycle } from "@/lib/sales";

export function BookingLifeChips({ life }: { life: BookingLifecycle }) {
  const chip = bookingLifeChip(life);
  return (
    <>
      <Chip tone={chip.tone}>{chip.label}</Chip>
      {life.otaDebt ? (
        <Chip tone="gold">Công nợ OTA</Chip>
      ) : life.otaHotel ? (
        <Chip tone="ok">Thanh toán tại KS</Chip>
      ) : life.deposited ? (
        <Chip tone="ok">Đã cọc</Chip>
      ) : life.active && !life.paid ? (
        <Chip tone="warn">Chưa cọc</Chip>
      ) : null}
    </>
  );
}

export function BookingLifecycleBar({ life }: { life: BookingLifecycle }) {
  if (life.phase === "cancelled" || life.phase === "no_show") return null;
  return (
    <ol className="booking-life" aria-label="Vòng đời booking">
      {life.steps.map((step) => (
        <li key={step.id} className={`booking-life-step is-${step.state}`}>
          <span className="booking-life-dot" aria-hidden />
          <span className="booking-life-label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
