/**
 * Server-side auth: scrypt password hashing + opaque session tokens stored in
 * Postgres, surfaced to the browser as an HTTP-only cookie.
 *
 * Nothing about credentials lives in the browser anymore — the client calls
 * the API and renders what comes back.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, sessions } from "@/db/schema";
import type { Role } from "@/lib/types";

export const SESSION_COOKIE = "carepulse_session";
const SESSION_DAYS = 30;

export interface SessionAccount {
  id: string;
  role: Role;
  name: string;
  email: string;
  patientId?: string;
  doctorId?: string;
  createdAt: string;
}

/* ─────────────── passwords (scrypt, server-side) ─────────────── */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/* ─────────────── sessions ─────────────── */

export async function createSession(accountId: string): Promise<void> {
  const db = await getDb();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);

  await db.insert(sessions).values({ token, accountId, expiresAt });
  // opportunistic cleanup of expired rows
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

  const jar = await cookies();
  // Secure flag only over https (Vercel sets x-forwarded-proto). A plain-http
  // LAN deployment (http://192.168.x.x) would silently drop secure cookies.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.token, token));
  }
  jar.delete(SESSION_COOKIE);
}

export async function getSessionAccount(): Promise<SessionAccount | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const rows = await db
    .select({
      accountId: accounts.id,
      role: accounts.role,
      name: accounts.name,
      email: accounts.email,
      patientId: accounts.patientId,
      doctorId: accounts.doctorId,
      createdAt: accounts.createdAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(eq(sessions.token, token))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) return null;

  return {
    id: row.accountId,
    role: row.role as Role,
    name: row.name,
    email: row.email,
    patientId: row.patientId ?? undefined,
    doctorId: row.doctorId ?? undefined,
    createdAt: row.createdAt,
  };
}
