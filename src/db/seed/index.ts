import type { AppDb } from "../index";
import * as t from "../schema";
import {
  syncDepartments,
  syncExtraCatalog,
  syncLegacyRoomDiscounts,
  syncDemoPerRoomDiscount,
  syncReceptionRoster,
  syncRoomCatalog,
  syncRoomTypeAdults,
  syncSalePaymentSplit,
  syncStaffUsers,
  syncTaskKinds,
} from "./sync";
import { seed } from "./lifecycle";

export { DEPT_SEED, STAFF_SEED, LOCAL_STAFF, RETIRED_USERNAMES } from "./data";
export { resetOpsDemo, wipeAllLocal, seed, seedOpsDemo } from "./lifecycle";
export { syncTaskKinds, syncReceptionRoster, syncRoomCatalog, syncExtraCatalog, syncDepartments, syncStaffUsers, userByUsername } from "./sync";

export async function seedIfEmpty(db: AppDb) {
  const existing = await db.select({ id: t.rooms.id }).from(t.rooms).limit(1);
  if (!existing.length) await seed(db);
  await syncDepartments(db);
  await syncStaffUsers(db);
  await syncRoomCatalog(db);
  await syncRoomTypeAdults(db);
  await syncExtraCatalog(db);
  await syncReceptionRoster(db);
  await syncTaskKinds(db);
  await syncLegacyRoomDiscounts(db);
  await syncDemoPerRoomDiscount(db);
  await syncSalePaymentSplit(db);
}
