/** Small shared helpers for the API route handlers. */
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getSessionAccount, type SessionAccount } from "./auth";
import { ensureSchema } from "./migrations";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireAccount(): Promise<
  { account: SessionAccount } | { response: NextResponse }
> {
  // First authenticated request in a process force-applies the additive
  // schema upgrade (memoized on globalThis afterwards). This keeps the
  // live Supabase database current on every deployment without a manual step.
  await ensureSchema();
  const account = await getSessionAccount();
  if (!account) {
    return { response: apiError("You are signed out. Please sign in again.", 401) };
  }
  return { account };
}

/** Role guard — returns a 403 response when the role is not allowed. */
export function ensureRole(
  account: SessionAccount,
  allowed: SessionAccount["role"][]
): NextResponse | null {
  if (!allowed.includes(account.role)) {
    return apiError("Your role does not have permission to do this.", 403);
  }
  return null;
}

export function newId(prefix: string, size = 6) {
  return prefix + nanoid(size).toUpperCase();
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
