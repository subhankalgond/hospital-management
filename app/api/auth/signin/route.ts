import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { json, apiError, readJson } from "@/lib/server/api";
import { verifyPassword, hashPassword, createSession } from "@/lib/server/auth";

/**
 * Legacy accounts imported from the localStorage-only build used salted
 * SHA-256 (hash + salt columns, hashAlgo = "sha256"). We verify those
 * transparently and upgrade the row to scrypt after a successful sign-in.
 */
function verifyLegacySha256(password: string, salt: string, expectedHex: string): boolean {
  const hash = createHash("sha256").update(`${salt}::${password}`).digest("hex");
  if (hash.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  const body = await readJson<{ email?: unknown; password?: unknown }>(req);
  if (!body) return apiError("Invalid request body.");

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return apiError("Please enter your email and password.", 422);

  const db = await getDb();
  const rows = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  const account = rows[0];
  if (!account) return apiError("No account found with this email.", 404);

  let valid = false;
  if (account.hashAlgo === "sha256" && account.salt) {
    valid = verifyLegacySha256(password, account.salt, account.passwordHash);
  } else {
    valid = verifyPassword(password, account.passwordHash);
  }
  if (!valid) return apiError("Incorrect password. Please try again.", 401);

  // Upgrade legacy hashes to scrypt so the weak-legacy path disappears.
  if (account.hashAlgo !== "scrypt") {
    await db
      .update(accounts)
      .set({ passwordHash: hashPassword(password), salt: null, hashAlgo: "scrypt" })
      .where(eq(accounts.id, account.id));
  }

  await createSession(account.id);
  return json({ ok: true, role: account.role, name: account.name });
}
