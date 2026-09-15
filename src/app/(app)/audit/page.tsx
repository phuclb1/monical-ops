import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Chip, Empty } from "@/components/ui";
import { getSession } from "@/lib/auth";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITIES,
  AUDIT_ENTITY_LABEL,
  actionTone,
  auditActorName,
  auditChanges,
  auditHref,
  auditTarget,
  formatAuditWhen,
} from "@/lib/audit-view";
import { can } from "@/lib/permissions";
import { listAuditLogs, listUsers } from "@/lib/repos";

function hrefWith(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `/audit?${text}` : "/audit";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; action?: string; actor?: string; before?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "viewAudit")) redirect("/more");
  const { entity, action, actor, before } = await searchParams;
  const [{ rows, nextBefore }, people] = await Promise.all([
    listAuditLogs({ entity: entity || undefined, action: action || undefined, actorId: actor || undefined, before: before || undefined }),
    listUsers(),
  ]);

  return (
    <main className="space-y-3 px-3 py-4">
      <div>
        <h1 className="text-xl font-bold">Nhật ký thao tác</h1>
        <p className="text-xs text-[#5c6665]">Chỉ quản lý. Ai làm gì, lúc nào, thêm mới hay sửa những trường nào.</p>
      </div>

      <form method="get" className="card grid gap-2 p-3 sm:grid-cols-3">
        <label>
          Đối tượng
          <select name="entity" defaultValue={entity || ""}>
            <option value="">Tất cả</option>
            {AUDIT_ENTITIES.map((item) => (
              <option key={item} value={item}>
                {AUDIT_ENTITY_LABEL[item]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Thao tác
          <select name="action" defaultValue={action || ""}>
            <option value="">Tất cả</option>
            {AUDIT_ACTIONS.map((item) => (
              <option key={item} value={item}>
                {AUDIT_ACTION_LABEL[item]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Người làm
          <select name="actor" defaultValue={actor || ""}>
            <option value="">Tất cả</option>
            <option value="ingest-agent">Agent PMS</option>
            {people
              .slice()
              .sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"))
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
          </select>
        </label>
        <button type="submit" className="rounded-xl bg-teal px-4 text-sm font-semibold text-white sm:col-span-3">
          Lọc
        </button>
      </form>

      {rows.length === 0 ? <Empty title="Chưa có nhật ký" text="Thao tác trên Ops sẽ hiện ở đây." /> : null}

      <div className="space-y-2">
        {rows.map((row) => {
          const who = auditActorName(row.actorId, row.actorName);
          const verb = AUDIT_ACTION_LABEL[row.action] || row.action;
          const kind = AUDIT_ENTITY_LABEL[row.entity] || row.entity;
          const target = auditTarget(row.entity, row.before, row.after);
          const href = auditHref(row.entity, row.entityId, row.before, row.after);
          const changes = auditChanges(row.before, row.after);
          return (
            <Card key={row.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{who}</p>
                  <p className="text-xs text-[#5c6665]">{formatAuditWhen(row.createdAt)}</p>
                </div>
                <Chip tone={actionTone(row.action)}>{verb}</Chip>
              </div>
              <p className="text-sm">
                {kind}
                {target ? ` · ${target}` : ""}
              </p>
              {href ? (
                <Link href={href} className="block min-h-11 text-sm font-semibold text-teal">
                  Mở bản ghi
                </Link>
              ) : null}
              {changes.length > 0 ? (
                <details>
                  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-teal">
                    Chi tiết thay đổi ({changes.length})
                  </summary>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {changes.map((change) => (
                      <li key={change.key} className="rounded-lg bg-sand px-2.5 py-2">
                        <p className="text-xs font-semibold text-[#5c6665]">{change.label}</p>
                        {change.kind === "add" ? (
                          <p>
                            Thêm: <b>{change.after}</b>
                          </p>
                        ) : change.kind === "remove" ? (
                          <p>
                            Xóa: <b>{change.before}</b>
                          </p>
                        ) : (
                          <p>
                            <span className="text-[#8a7a72] line-through">{change.before}</span>
                            {" → "}
                            <b>{change.after}</b>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </Card>
          );
        })}
      </div>

      {nextBefore ? (
        <Link
          href={hrefWith({ entity, action, actor, before: nextBefore })}
          className="cta-link w-full"
        >
          Xem cũ hơn
        </Link>
      ) : null}
    </main>
  );
}
