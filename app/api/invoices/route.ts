import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount } from "@/lib/server/api";
import { todayISO, addDays } from "@/lib/utils";

export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  if (account.role === "patient") return apiError("Patients cannot create invoices.", 403);

  const body = await readJson<{
    patientId?: string;
    items?: { label?: string; amount?: number }[];
    dueDays?: number;
  }>(req);
  if (!body?.patientId) return apiError("Missing patient.", 422);
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return apiError("An invoice needs at least one line item.", 422);
  }

  const items = body.items
    .filter((it) => it && typeof it.label === "string" && it.label.trim())
    .map((it) => ({
      label: it.label!.trim().slice(0, 160),
      amount: Math.round(Number(it.amount ?? 0) * 100) / 100,
    }));
  if (items.length === 0) return apiError("An invoice needs at least one line item.", 422);

  const invoice = {
    id: newId("INV-", 6),
    patientId: body.patientId,
    date: todayISO(),
    dueDate: addDays(todayISO(), Math.max(1, Math.min(90, Number(body.dueDays ?? 14)))),
    items,
    status: "pending",
  };

  const db = await getDb();
  await db.insert(invoices).values(invoice);
  return json({ ok: true, id: invoice.id });
}
