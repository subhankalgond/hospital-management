/** Audit-log helpers — access & change records for sensitive entities. */
import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "./api";
import type { SessionAccount } from "./auth";

interface AuditInput {
  action: "view" | "create" | "update" | "delete" | "login" | "logout";
  entity: string;
  entityId?: string;
  detail?: string;
}

/** Fire-and-forget audit write — never blocks or fails the request path. */
export async function recordAudit(account: SessionAccount, input: AuditInput): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(auditLogs).values({
      id: newId("AL-", 10),
      actorId: account.id,
      actorName: account.name,
      actorRole: account.role,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      detail: (input.detail ?? "").slice(0, 400),
    });
  } catch (err) {
    console.error("[audit] write failed:", err instanceof Error ? err.message : err);
  }
}
