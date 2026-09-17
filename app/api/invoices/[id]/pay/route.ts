import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { json, apiError, requireAccount } from "@/lib/server/api";
import { todayISO } from "@/lib/utils";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;

  const db = await getDb();
  const rows = await db.select().from(invoices).where(eq(invoices.id, params.id)).limit(1);
  const invoice = rows[0];
  if (!invoice) return apiError("Invoice not found.", 404);
  if (account.role === "patient" && invoice.patientId !== account.patientId) {
    return apiError("You can only pay your own invoices.", 403);
  }

  await db
    .update(invoices)
    .set({ status: "paid", paidAt: todayISO() })
    .where(eq(invoices.id, invoice.id));
  return json({ ok: true });
}
