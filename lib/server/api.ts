/** Small shared helpers for the API route handlers. */
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getSessionAccount, type SessionAccount } from "./auth";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireAccount(): Promise<
  { account: SessionAccount } | { response: NextResponse }
> {
  const account = await getSessionAccount();
  if (!account) {
    return { response: apiError("You are signed out. Please sign in again.", 401) };
  }
  return { account };
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
