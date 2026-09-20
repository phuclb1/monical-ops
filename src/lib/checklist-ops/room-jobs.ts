export type RoomJobSale = {
  roomId: string;
  guestName: string;
  status: string;
  checkIn: string;
  checkOut: string;
  pmsCode?: string | null;
};

export type RoomJobStay = {
  id: string;
  roomId: string | null;
  guestName: string;
  status: string;
  arrivalDate: string;
  departureDate: string;
  pmsCode?: string | null;
};

export function stayForSale(stays: RoomJobStay[], sale: RoomJobSale) {
  const pms = sale.pmsCode?.trim();
  return (
    stays.find((row) => row.roomId === sale.roomId && pms && row.pmsCode === pms) ??
    stays.find((row) => row.roomId === sale.roomId && row.guestName === sale.guestName) ??
    stays.find((row) => !row.roomId && pms && row.pmsCode === pms)
  );
}
