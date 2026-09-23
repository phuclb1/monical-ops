import { like, or } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { stayBoardStatus } from "../stay-checklist";
import { todayVN } from "../datetime";
import { listStays } from "./stays";
import { listTasks } from "./tasks";

export async function searchOps(q: string) {
  const db = await getDb();
  const query = `%${q}%`;
  const stays = await db.select().from(t.stays).where(or(like(t.stays.pmsCode, query), like(t.stays.guestName, query)));
  const tasks = await db.select().from(t.tasks).where(like(t.tasks.content, query));
  const forms = await db.select().from(t.formSubmissions).where(like(t.formSubmissions.formCode, query));
  return { stays, tasks, forms };
}

export async function overdueReport() {
  const tasks = await listTasks();
  const stays = await listStays();
  const now = Date.now();
  return {
    tasks: tasks.filter((t0) => t0.dueAt && new Date(t0.dueAt).getTime() < now && !["done", "checked"].includes(t0.status)),
    registrations: stays.filter((s) => s.registrationDueAt && !s.registrationDoneAt && new Date(s.registrationDueAt).getTime() < now),
    checkouts: stays.filter(
      (s) => stayBoardStatus(s, todayVN()) === "departing" && ((s.invoiceRequested && !s.invoiceOk) || !s.pmsCheckoutOk),
    ),
  };
}
