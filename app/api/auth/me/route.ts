import { json, requireAccount, apiError } from "@/lib/server/api";
import { getSessionAccount } from "@/lib/server/auth";

export async function GET() {
  const account = await getSessionAccount();
  if (!account) return apiError("Not signed in.", 401);
  return json({ account });
}

export async function POST() {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  return json({ account: guard.account });
}
