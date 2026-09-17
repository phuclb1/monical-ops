import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookingConfirmation } from "@/components/booking-confirmation";
import { PrintButton } from "@/components/print-button";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getBooking } from "@/lib/repos";

export default async function BookingPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageSales")) redirect("/more");
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();

  return (
    <main className="booking-print">
      <div className="print-toolbar">
        <Link href={`/sales/bookings/${booking.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
          ← Đặt phòng
        </Link>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <PrintButton />
          <Link href={`/sales/bookings/${booking.id}`} className="print-toolbar-ghost">
            Đóng
          </Link>
        </div>
      </div>
      <BookingConfirmation booking={booking} />
    </main>
  );
}
