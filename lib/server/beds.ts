/**
 * Seeds the live bed inventory from the ward structure on first ever load.
 * Used by the bed management + recommendation APIs.
 */
import { getDb } from "@/db";
import { beds as bedsT, wards as wardsT } from "@/db/schema";

export async function ensureBedsSeeded(): Promise<void> {
  const db = await getDb();
  const existing = await db.select({ id: bedsT.id }).from(bedsT).limit(1);
  if (existing.length > 0) return;

  const wardRows = await db.select().from(wardsT);
  if (wardRows.length === 0) return;

  interface BedTuple {
    id: string;
    label: string;
    wardId: string;
    wardName: string;
    floor: number;
    roomId: string;
    roomLabel: string;
    type: string;
  }
  const now = new Date().toISOString();
  const tuples: BedTuple[] = [];
  for (const w of wardRows) {
    const rooms = (w.rooms ?? []) as { id: string; label: string; type: string; beds: { id: string; label: string; patientId?: string; since?: string }[] }[];
    for (const r of rooms) {
      for (const b of r.beds) {
        tuples.push({ id: b.id, label: b.label, wardId: w.id, wardName: w.name, floor: w.floor, roomId: r.id, roomLabel: r.label, type: r.type });
      }
    }
  }
  if (tuples.length === 0) return;
  await db.insert(bedsT).values(
    tuples.map((t) => ({
      id: t.id,
      label: t.label,
      wardId: t.wardId,
      wardName: t.wardName,
      floor: t.floor,
      roomId: t.roomId,
      roomLabel: t.roomLabel,
      type: t.type,
      status: "available",
      lastStatusChange: now,
    }))
  );
}
