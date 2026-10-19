import { and, isNotNull, isNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nowISO, todayVN } from "../datetime";
import { foldSearchText, searchTokens, sqlFolded } from "../search-text";
import { stayBoardStatus } from "../stay-checklist";

const OPS_SEARCH_LIMIT = 40;

function likeContains(value: string) {
  return `%${value.replace(/[%_]/g, "")}%`;
}

export async function searchOps(q: string) {
  const db = await getDb();
  const tokens = searchTokens(q);
  if (!tokens.length) return { stays: [], tasks: [], forms: [] };
  const likes = tokens.map((token) => likeContains(token));
  const stayMatch = and(
    ...likes.map((like) =>
      or(sql`${sqlFolded(sql`${t.stays.pmsCode}`)} LIKE ${like}`, sql`${sqlFolded(sql`${t.stays.guestName}`)} LIKE ${like}`),
    ),
  );
  const taskMatch = and(
    ...likes.map((like) =>
      or(sql`${sqlFolded(sql`${t.tasks.content}`)} LIKE ${like}`, sql`${sqlFolded(sql`ifnull(${t.tasks.area}, '')`)} LIKE ${like}`),
    ),
  );
  const formLike = likeContains(foldSearchText(q));
  const [stays, tasks, forms] = await Promise.all([
    db.select().from(t.stays).where(stayMatch).limit(OPS_SEARCH_LIMIT),
    db.select().from(t.tasks).where(taskMatch).limit(OPS_SEARCH_LIMIT),
    db
      .select({
        id: t.formSubmissions.id,
        formCode: t.formSubmissions.formCode,
        date: t.formSubmissions.date,
        submittedBy: t.formSubmissions.submittedBy,
        createdAt: t.formSubmissions.createdAt,
      })
      .from(t.formSubmissions)
      .where(and(isNull(t.formSubmissions.deletedAt), sql`${sqlFolded(sql`${t.formSubmissions.formCode}`)} LIKE ${formLike}`))
      .limit(OPS_SEARCH_LIMIT),
  ]);
  return { stays, tasks, forms };
}

export async function overdueReport() {
  const db = await getDb();
  const now = nowISO();
  const today = todayVN();
  const [tasks, stayRows, rooms] = await Promise.all([
    db
      .select()
      .from(t.tasks)
      .where(and(isNotNull(t.tasks.dueAt), lt(t.tasks.dueAt, now), notInArray(t.tasks.status, ["done", "checked"]))),
    db.select().from(t.stays).where(ne(t.stays.status, "departed")),
    db.select({ id: t.rooms.id, number: t.rooms.number }).from(t.rooms),
  ]);
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const stays = stayRows.map((stay) => ({ ...stay, room: stay.roomId ? roomById.get(stay.roomId) || null : null }));
  return {
    tasks,
    registrations: stays.filter((s) => s.registrationDueAt && !s.registrationDoneAt && new Date(s.registrationDueAt).getTime() < Date.now()),
    checkouts: stays.filter(
      (s) => stayBoardStatus(s, today) === "departing" && ((s.invoiceRequested && !s.invoiceOk) || !s.pmsCheckoutOk),
    ),
  };
}
