import { destroySession } from "@/lib/server/auth";
import { json } from "@/lib/server/api";

export async function POST() {
  await destroySession();
  return json({ ok: true });
}
