import { getSessionAccount } from "@/lib/server/auth";
import { buildState } from "@/lib/server/state";
import { json } from "@/lib/server/api";

/** Dynamic route: reads the session cookie. */
export const dynamic = "force-dynamic";

export async function GET() {
  const account = await getSessionAccount();
  if (!account) return json({ error: "Not signed in." }, 401);
  const state = await buildState(account);
  return json(state);
}
