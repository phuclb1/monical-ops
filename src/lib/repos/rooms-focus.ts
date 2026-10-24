import { buildRoomFocus } from "../room-focus";
import { listActiveRoomSales } from "./sales/queries";

export async function roomFocusBoard(date: string) {
  const sales = await listActiveRoomSales();
  return buildRoomFocus({ date, sales });
}
