/**
 * Database connection layer.
 *
 * - `DATABASE_URL` set → real Supabase/Postgres via the `postgres` driver
 *   (prepared statements disabled for Supabase's transaction pooler).
 * - unset → in-process PGlite (Postgres in WASM) so `npm run dev` works with
 *   zero configuration; `drizzle/0000_init.sql` is applied automatically when
 *   the database is empty.
 *
 * The client is cached on globalThis so Next.js dev hot reloads reuse it.
 */
import { drizzle as drizzlePostgresJs } from "drizzle-orm/postgres-js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AnyDb = any;

const g = globalThis as unknown as {
  __cpDb?: Promise<AnyDb>;
};

export function getDb(): Promise<AnyDb> {
  if (!g.__cpDb) g.__cpDb = createDb();
  return g.__cpDb;
}

async function createDb(): Promise<AnyDb> {
  if (process.env.DATABASE_URL) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(process.env.DATABASE_URL, {
      // Supabase pooler (PgBouncer) runs transaction mode: no prepared stmts.
      prepare: false,
      max: 10,
      idle_timeout: 20,
      connect_timeout: 15,
    });
    // postgres.js client pairs with the postgres-js drizzle driver.
    return drizzlePostgresJs(sql) as AnyDb;
  }

  // ───────── PGlite fallback (local dev without DATABASE_URL) ─────────
  // Dynamic import: keeps the WASM database out of production bundles.
  const { PGlite } = await import("@electric-sql/pglite");
  const pglite = new PGlite();
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const db = drizzlePglite(pglite) as AnyDb;
  db.__pglite = true;
  db.__pgliteClient = pglite;

  // Apply the canonical schema if the accounts table doesn't exist yet.
  try {
    const probe = await pglite.query<{ exists: boolean }>(
      `select exists (select 1 from information_schema.tables where table_name = 'accounts') as exists`
    );
    if (!probe.rows[0]?.exists) {
      const { readFile } = await import("fs/promises");
      const { join } = await import("path");
      const sqlPath = join(process.cwd(), "drizzle", "0000_init.sql");
      const sqlText = await readFile(sqlPath, "utf8");
      await pglite.exec(sqlText);
    }
  } catch (err) {
    console.error("[db] failed to initialize PGlite schema:", err);
  }

  return db;
}

/** Raw SQL access (used for the seed/import queries). */
export async function rawClient(): Promise<unknown | null> {
  const db = await getDb();
  return (db.__pgliteClient as unknown) ?? null;
}

export function isPglite(db: AnyDb): boolean {
  return Boolean(db?.__pglite);
}
