import { redirect } from "next/navigation";
import { approveIncidentAction, createIncidentAction } from "@/actions/ops";
import { Btn, Card, Chip, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/datetime";
import { listIncidents, listRooms, listUsers } from "@/lib/repos";

export default async function IncidentsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const [rows, rooms, users] = await Promise.all([listIncidents(), listRooms(), listUsers()]);

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Sự cố · BM-14</h1>
      <Card>
        <form action={createIncidentAction} className="space-y-2">
          <Field label="Loại">
            <select name="type" defaultValue="ops">
              <option value="ops">Vận hành</option>
              <option value="facility">Cơ sở vật chất</option>
              <option value="food">ATTP / bếp</option>
              <option value="safety">An toàn</option>
              <option value="ooo">OOO</option>
            </select>
          </Field>
          <Field label="Mức độ">
            <select name="severity" defaultValue="medium">
              <option value="low">Thấp</option>
              <option value="medium">Trung bình</option>
              <option value="high">Cao</option>
            </select>
          </Field>
          <Field label="Phòng">
            <select name="roomId" defaultValue="">
              <option value="">Không gắn</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  P.{r.number}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vị trí">
            <input name="location" placeholder="Sảnh / bếp / P.303" />
          </Field>
          <Field label="Mô tả">
            <textarea name="description" required />
          </Field>
          <Btn type="submit" className="w-full">
            Báo sự cố
          </Btn>
        </form>
      </Card>
      {rows.map((row) => {
        const who = users.find((u) => u.id === row.reportedBy);
        return (
          <Card key={row.id}>
            <div className="flex items-start justify-between">
              <p className="font-semibold">{row.description}</p>
              <Chip tone={row.status === "approved" ? "ok" : "warn"}>{row.status}</Chip>
            </div>
            <p className="text-xs text-[#5c6665]">
              {row.type} · {row.severity} · {who?.fullName} · {formatDateTime(row.createdAt)}
            </p>
            {row.status === "pending" && can(user.role, "approveIncident") ? (
              <form action={approveIncidentAction} className="mt-2">
                <input type="hidden" name="id" value={row.id} />
                <Btn type="submit" variant="ghost" className="w-full">
                  Duyệt
                </Btn>
              </form>
            ) : null}
          </Card>
        );
      })}
    </main>
  );
}
