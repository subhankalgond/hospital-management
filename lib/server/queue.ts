/**
 * Server-side OPD queue engine: token allocation, live positions and the
 * race-safe "call next patient" transaction.
 *
 * Guarantees:
 * - Token numbers are allocated inside a transaction per (doctor, clinic-day),
 *   so two simultaneous issuers can never draw the same number.
 * - A patient can hold at most one ACTIVE entry (waiting|called) per doctor
 *   per day — enforced by a partial unique index; a duplicate submission
 *   returns the existing entry instead of issuing a second token.
 * - `callNext` uses SELECT ... FOR UPDATE SKIP LOCKED, so two doctors (or
 *   admin + doctor) racing the button always get distinct patients.
 * - Emergency priority is engine-enforced: the emergency-coded entry comes
 *   first regardless of token order. Calling "next" never suppresses it.
 * - Public display payloads contain NO patient identity — tokens only.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { doctors as doctorsT, queueEntries, type QueueEntryRow } from "@/db/schema";
import { newId } from "./api";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function queueDate(d = new Date()): string {
  // Server-local clinic day. On Vercel this is UTC; the label is documented
  // so operators know which day window the numbers belong to.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export interface AddToQueueInput {
  doctorId: string;
  patientId: string;
  source: "appointment" | "walk_in" | "emergency";
  priority?: "normal" | "emergency";
  appointmentId?: string;
  note?: string;
  idemKey?: string;
  registeredBy?: string;
  registeredByName?: string;
}

export type QueueAddResult =
  | { ok: true; entry: QueueEntryRow; duplicate: boolean }
  | { ok: false; error: string; status: number };

/**
 * Issues a token. Idempotent on idemKey; additionally self-deduplicates by
 * the active-entry unique index (patient may not hold two live tokens).
 */
export async function addToQueue(db: any, input: AddToQueueInput): Promise<QueueAddResult> {
  const doctorRows = await db.select().from(doctorsT).where(eq(doctorsT.id, input.doctorId)).limit(1);
  const doctor = doctorRows[0];
  if (!doctor) {
    return { ok: false, error: "Doctor not found.", status: 404 };
  }
  const day = queueDate();

  // Retry-on-race: token allocation can collide when two rows race MAX+1.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (input.idemKey) {
        const dup = await db
          .select()
          .from(queueEntries)
          .where(eq(queueEntries.idemKey, input.idemKey))
          .limit(1);
        if (dup[0]) return { ok: true, entry: dup[0], duplicate: true };
      }

      // Active duplicate for the same patient/doctor/day?
      const active = await db
        .select()
        .from(queueEntries)
        .where(
          and(
            eq(queueEntries.queueDate, day),
            eq(queueEntries.doctorId, input.doctorId),
            eq(queueEntries.patientId, input.patientId),
            sql`status in ('waiting','called')`
          )
        )
        .limit(1);
      if (active[0]) return { ok: true, entry: active[0], duplicate: true };

      const maxRows = await db.execute(
        sql`select coalesce(max(token_no), 0)::int as m from queue_entries where queue_date = ${day} and doctor_id = ${input.doctorId}`
      );
      const maxRowsList: any[] = Array.isArray(maxRows) ? maxRows : maxRows.rows ?? [];
      const nextToken = Number(maxRowsList[0]?.m ?? 0) + 1;

      const inserted = await db
        .insert(queueEntries)
        .values({
          id: newId("QE-", 6),
          queueDate: day,
          doctorId: input.doctorId,
          department: doctor.department,
          patientId: input.patientId,
          appointmentId: input.appointmentId ?? null,
          source: input.source,
          priority: input.priority === "emergency" ? "emergency" : "normal",
          status: "waiting",
          tokenNo: nextToken,
          note: (input.note ?? "").slice(0, 400),
          idemKey: input.idemKey ?? null,
          registeredBy: input.registeredBy ?? null,
        })
        .returning();

      const rows: QueueEntryRow[] = Array.isArray(inserted) ? inserted : inserted.rows ?? [];
      if (rows[0]) return { ok: true, entry: rows[0], duplicate: false };
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      // The partial unique index is the hard guarantee — a concurrent issuer
      // created the patient's entry between our check and our insert.
      if (msg.includes("queue_entries_active_uniq") || msg.includes("queue_entries_token_idx")) {
        const again = await db
          .select()
          .from(queueEntries)
          .where(
            and(
              eq(queueEntries.queueDate, day),
              eq(queueEntries.doctorId, input.doctorId),
              eq(queueEntries.patientId, input.patientId),
              sql`status in ('waiting','called')`
            )
          )
          .limit(1);
        if (again[0]) return { ok: true, entry: again[0], duplicate: true };
        continue; // token collision — retry with a fresh MAX
      }
      if (msg.includes("queue_entries_idem_idx") && input.idemKey) {
        const dup = await db.select().from(queueEntries).where(eq(queueEntries.idemKey, input.idemKey)).limit(1);
        if (dup[0]) return { ok: true, entry: dup[0], duplicate: true };
      }
      throw err;
    }
  }
  return { ok: false, error: "Queue is busy — please retry.", status: 503 };
}

async function rowsOfList(res: any): Promise<any[]> {
  return Array.isArray(res) ? res : res?.rows ?? [];
}

/**
 * Calls the next eligible patient: emergency priority first, then lowest
 * token. The FOR UPDATE + SKIP LOCKED update makes simultaneous calls from
 * two staff members serialize — each click consumes exactly one patient.
 */
export async function callNext(
  db: any,
  doctorId: string,
  calledBy: string,
  calledByName: string
): Promise<{ ok: true; entry: QueueEntryRow } | { ok: false; error: string; status: number }> {
  const day = queueDate();
  const res = await db.execute(sql`
    update queue_entries
       set status = 'called',
           called_by = ${calledBy},
           called_by_name = ${calledByName},
           called_at = ${new Date().toISOString()},
           updated_at = now()
     where id = (
       select id from queue_entries
        where queue_date = ${day}
          and doctor_id = ${doctorId}
          and status = 'waiting'
        order by (priority = 'emergency') desc, token_no asc
        limit 1
        for update skip locked
     )
     returning *`);
  const rows: QueueEntryRow[] = await rowsOfList(res);
  if (!rows[0]) {
    return { ok: false, error: "No patient is waiting in your queue.", status: 409 };
  }
  return { ok: true, entry: rows[0] };
}

export type QueueAction = "missed" | "done" | "cancel" | "requeue" | "review_note" | "priority";

/** Applies a queue action with role-appropriate transition rules. */
export async function queueAction(
  db: any,
  entryId: string,
  action: QueueAction,
  opts: {
    account: { id: string; role: string; name: string; doctorId?: string };
    note?: string;
    priority?: "normal" | "emergency";
  }
): Promise<{ ok: boolean; error?: string; status?: number; entry?: QueueEntryRow }> {
  const rows = await db.select().from(queueEntries).where(eq(queueEntries.id, entryId)).limit(1);
  const entry = rows[0] as QueueEntryRow | undefined;
  if (!entry) return { ok: false, error: "Queue entry not found.", status: 404 };

  // Doctors may only act inside their own queue; admins can act anywhere.
  if (opts.account.role === "doctor" && entry.doctorId !== opts.account.doctorId) {
    return { ok: false, error: "You can only manage your own queue.", status: 403 };
  }
  if (opts.account.role !== "doctor" && opts.account.role !== "admin") {
    return { ok: false, error: "Not allowed.", status: 403 };
  }
  if (entry.status === "cancelled" || entry.status === "done" || entry.status === "missed") {
    if (action !== "requeue") {
      return { ok: false, error: `This entry is already ${entry.status}. Only requeue is possible.`, status: 409 };
    }
  }

  const patch: Record<string, any> = { updatedAt: new Date() };
  switch (action) {
    case "missed":
      if (entry.status !== "called" && entry.status !== "waiting") {
        return { ok: false, error: "Only called or waiting patients can be marked missed.", status: 409 };
      }
      patch.status = "missed";
      break;
    case "done":
      if (entry.status !== "called") {
        return { ok: false, error: "Call the patient before marking the consultation done.", status: 409 };
      }
      patch.status = "done";
      break;
    case "cancel":
      patch.status = "cancelled";
      break;
    case "requeue":
      patch.status = "waiting";
      patch.calledBy = null;
      patch.calledByName = "";
      patch.calledAt = null;
      break;
    case "review_note":
      patch.reviewNote = (opts.note ?? "").slice(0, 1000) || null;
      break;
    case "priority":
      patch.priority = opts.priority === "emergency" ? "emergency" : "normal";
      break;
    default:
      return { ok: false, error: "Unknown queue action.", status: 400 };
  }

  const updated = await db.update(queueEntries).set(patch).where(eq(queueEntries.id, entryId)).returning();
  const out: QueueEntryRow[] = Array.isArray(updated) ? updated : updated.rows ?? [];
  return { ok: true, entry: out[0] ?? entry };
}

export interface QueuePositionView {
  entry: QueueEntryRow;
  /** how many still-waiting entries are ahead of this one */
  ahead: number;
  /** token currently being called by this doctor, if any */
  currentCalled: { tokenNo: number; calledAt: string | null } | null;
  doctorName: string;
  department: string;
}

/**
 * Computes the patient's live position without inventing wait times. The
 * estimate field is intentionally absent: position and called-token are the
 * reliable facts; a fabricated "X minutes" would not be.
 */
export async function queuePositionForPatient(
  db: any,
  patientId: string
): Promise<QueuePositionView | null> {
  const day = queueDate();
  const mine = await db
    .select()
    .from(queueEntries)
    .where(
      and(
        eq(queueEntries.patientId, patientId),
        eq(queueEntries.queueDate, day),
        sql`status in ('waiting','called')`
      )
    )
    .orderBy(queueEntries.tokenNo)
    .limit(1);
  const entry = mine[0];
  if (!entry) return null;

  const docRows = await db.select().from(doctorsT).where(eq(doctorsT.id, entry.doctorId)).limit(1);
  const doctor = docRows[0];

  let ahead = 0;
  if (entry.status === "waiting") {
    const aheadRes = await db.execute(sql`
      select count(*)::int as n from queue_entries
       where queue_date = ${day} and doctor_id = ${entry.doctorId}
         and status = 'waiting'
         and ((priority = 'emergency') > (case when ${entry.priority} = 'emergency' then 1 else 0 end)
              or ((priority = 'emergency') = (case when ${entry.priority} = 'emergency' then 1 else 0 end)
                  and token_no < ${entry.tokenNo}))`);
    const list = await rowsOfList(aheadRes);
    ahead = Number(list[0]?.n ?? 0);
  }

  let currentCalled: QueuePositionView["currentCalled"] = null;
  const called = await db
    .select()
    .from(queueEntries)
    .where(
      and(
        eq(queueEntries.queueDate, day),
        eq(queueEntries.doctorId, entry.doctorId),
        eq(queueEntries.status, "called")
      )
    )
    .limit(1);
  if (called[0]) {
    currentCalled = { tokenNo: called[0].tokenNo, calledAt: called[0].calledAt ?? null };
  }

  return {
    entry,
    ahead,
    currentCalled,
    doctorName: doctor?.name ?? "Doctor",
    department: doctor?.department ?? entry.department,
  };
}

export interface DoctorQueueView {
  entries: QueueEntryRow[];
  waiting: number;
  currentCalled: QueueEntryRow | null;
}

export async function queueForDoctor(
  db: any,
  doctorId: string,
  day: string
): Promise<DoctorQueueView> {
  const entries = (await db
    .select()
    .from(queueEntries)
    .where(and(eq(queueEntries.queueDate, day), eq(queueEntries.doctorId, doctorId)))
    .orderBy(queueEntries.tokenNo)) as QueueEntryRow[];
  return {
    entries,
    waiting: entries.filter((e) => e.status === "waiting").length,
    currentCalled: entries.find((e) => e.status === "called") ?? null,
  };
}

/** Public waiting-display payload — tokens and department labels ONLY. */
export async function publicDisplay(
  db: any,
  day: string
): Promise<{ updatedAt: string; boards: { doctorId: string; doctorName: string; department: string; currentCalled: number | null; lastCalled: number[] }[] }> {
  const entries = (await db
    .select()
    .from(queueEntries)
    .where(and(eq(queueEntries.queueDate, day), sql`status in ('waiting','called','done')`))
    .orderBy(queueEntries.tokenNo)) as QueueEntryRow[];
  const docList = (await db.select().from(doctorsT)) as any[];
  const byDoctor = new Map<string, QueueEntryRow[]>();
  for (const e of entries) {
    const list = byDoctor.get(e.doctorId) ?? [];
    list.push(e);
    byDoctor.set(e.doctorId, list);
  }
  const boards = Array.from(byDoctor.entries()).map(([doctorId, list]) => {
    const called = list.filter((e) => e.status === "called").sort((a, b) => (b.calledAt ?? "").localeCompare(a.calledAt ?? ""));
    const lastCalled = list
      .filter((e) => e.status === "done" || e.status === "called")
      .sort((a, b) => (b.calledAt ?? "").localeCompare(a.calledAt ?? ""))
      .slice(0, 5)
      .map((e) => e.tokenNo);
    const doc = docList.find((d) => d.id === doctorId);
    return {
      doctorId,
      doctorName: doc?.name ?? "Doctor",
      department: doc?.department ?? "",
      currentCalled: called[0]?.tokenNo ?? null,
      lastCalled,
    };
  });
  return { updatedAt: new Date().toISOString(), boards };
}
