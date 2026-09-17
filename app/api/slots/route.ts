import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments } from "@/db/schema";
import { json, apiError, requireAccount } from "@/lib/server/api";

/** GET /api/slots?doctorId=…&date=YYYY-MM-DD → { taken: string[] } */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const doctorId = url.searchParams.get("doctorId") ?? "";
  const date = url.searchParams.get("date") ?? "";
  if (!doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return apiError("doctorId and a valid date are required.", 422);
  }

  const db = await getDb();
  const rows = await db
    .select({ time: appointments.time })
    .from(appointments)
    .where(
      and(
        eq(appointments.doctorId, doctorId),
        eq(appointments.date, date),
        ne(appointments.status, "cancelled")
      )
    );

  return json({ taken: rows.map((r: { time: string }) => r.time) });
}
