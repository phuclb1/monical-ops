import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BookingConfirmation } from "@/components/booking-confirmation";
import { PrintToolbar } from "@/components/print-toolbar";
import { getSession } from "@/lib/auth";
import { HOTEL_LETTERHEAD } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { getBooking } from "@/lib/repos";
import { bookingPdfFilename } from "@/lib/sales";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) return { title: HOTEL_LETTERHEAD };
  return { title: bookingPdfFilename(booking).replace(/\.pdf$/i, "") };
}

export default async function BookingPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageSales")) redirect("/more");
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();
  const pdfName = bookingPdfFilename(booking);
  const fileBaseName = pdfName.replace(/\.pdf$/i, "");

  return (
    <main className="booking-print">
      <PrintToolbar backHref={`/sales/bookings/${booking.id}`} filename={pdfName} fileBaseName={fileBaseName} />
      <BookingConfirmation booking={booking} />
    </main>
  );
}
