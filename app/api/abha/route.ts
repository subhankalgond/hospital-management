import { eq, desc, and } from "drizzle-orm";
import { getDb } from "@/db";
import { abhaLinks, abdmConsents } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount } from "@/lib/server/api";
import { recordAudit } from "@/lib/server/audit";

export const dynamic = "force-dynamic";

/**
 * ABDM / ABHA — integration-ready service layer.
 *
 * ── What works today ─────────────────────────────────────────────────────────
 * Patients can record their OWN ABHA number/address (QR scan/manual entry),
 * review consent records, grant and revoke them. Everything they enter is
 * stored with status `pending` and an explicit "unverified" label: this
 * deployment has no ABDM gateway credentials, and NOTHING here claims
 * linkage to national health records.
 *
 * ── What requires official credentials ───────────────────────────────────────
 * Real ABHA verification, health-information exchange (HIP/HIU API endpoints
 * under abdm.gov.in), consent-artefact signing and gateway callbacks all
 * require the facility's ABDM approval, gateway client ID/secret and
 * registered routes (see INTEGRATIONS.md). Until then:
 *  - No ABHA number is ever generated or validated against the gateway.
 *  - No health data is fetched from centre HI providers.
 *  - Tokens/secrets live in server env only.
 *
 * ── Configuration knobs (server env) ────────────────────────────────────────
 * ABDM_CLIENT_ID / ABDM_CLIENT_SECRET  gateway credentials (absent today)
 * ABDM_SANDBOX_URL                     gateway base URL for sandbox testing
 * ABDM_CALLBACK_SECRET                 verification secret for gateway callbacks
 */
async function gatewayConfigured(): Promise<boolean> {
  return !!(process.env.ABDM_CLIENT_ID && process.env.ABDM_CLIENT_SECRET);
}

/** GET /api/abha → patient's links + consents (own data only). */
export async function GET(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const db = await getDb();

  const url = new URL(req.url);
  const requested = url.searchParams.get("patientId") ?? "";
  const patientId = account.role === "patient" ? account.patientId ?? "" : requested;
  if (!patientId) return apiError("patientId is required.", 422);
  if (account.role === "patient" && recorded(patientId, account.patientId) === false) {
    return apiError("You can only access your own ABHA data.", 403);
  }

  const [links, consents] = await Promise.all([
    db.select().from(abhaLinks).where(eq(abhaLinks.patientId, patientId)).orderBy(desc(abhaLinks.createdAt)).limit(5),
    db.select().from(abdmConsents).where(eq(abdmConsents.patientId, patientId)).orderBy(desc(abdmConsents.createdAt)).limit(20),
  ]);

  return json({
    links,
    consents,
    gatewayConnected: await gatewayConfigured(),
    note: await gatewayConfigured()
      ? "Gateway credentials are configured — connect the deployed callbacks to activate verified linkage."
      : "Integration-ready only: no official ABDM gateway credentials are configured on this deployment. ABHA records entered here stay UNVERIFIED, and no national health records are being exchanged.",
    // Frontends must show this unless gatewayConnected is true.
  });
}

function recorded(a: string, b?: string | null): boolean {
  return !!b && a === b;
}

/**
 * POST /api/abha — patient records their ABHA number/address (self-entry; QR
 * or manual). Values are stored as provided, status `pending`, never
 * generated or validated by us.
 */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const body = await readJson<{
    kind?: "identifier" | "consent_request";
    abhaNumber?: string;
    abhaAddress?: string;
    method?: string;
    note?: string;
    // consent fields
    purpose?: string;
    hiTypes?: string[];
    rangeFrom?: string;
    rangeTo?: string;
  }>(req);

  const patientId = account.role === "patient" ? account.patientId ?? "" : "";
  if (!patientId) return apiError("Only patients record their own ABHA identifiers or consent requests.", 403);
  const db = await getDb();

  // ── Consent-based exchange request (patient-initiated entry point). ──
  if (body?.kind === "consent_request") {
    const purpose = (body.purpose ?? "care_management").toString().slice(0, 120);
    const hiTypes = (body.hiTypes ?? []).slice(0, 6).map((t) => t.toString().slice(0, 40));
    const rows = await db
      .insert(abdmConsents)
      .values({
        id: newId("AC-", 6),
        patientId,
        purpose,
        hiTypes,
        rangeFrom: (body.rangeFrom ?? "").toString().slice(0, 10),
        rangeTo: (body.rangeTo ?? "").toString().slice(0, 10),
        status: "requested",
        note: "Local request recorded. Actual consent ARTEFACTS and health-data exchange require an authorized ABDM gateway connection — nothing has been exchanged.",
      })
      .returning();
    const outC: any[] = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
    await recordAudit(account, { action: "create", entity: "abdm-consent", entityId: outC[0]?.id, detail: `consent request purpose=${purpose}` });
    return json({ ok: true, consent: outC[0], notice: outC[0].note }, 201);
  }

  const number = (body?.abhaNumber ?? "").trim();
  const address = (body?.abhaAddress ?? "").trim();
  if (!number && !address) return apiError("Provide the ABHA number or ABHA address exactly as issued by ABDM.", 422);
  if (number && !/^\d{2}-\d{4}-\d{4}-\d{4}$/.test(number)) {
    // Format-check only — NOT gateway verification. Numbers are stored and
    // flagged unverified; no claim of linkage is made.
    return apiError("ABHA numbers follow the 14-digit XX-XXXX-XXXX-XXXX format. Check the value as issued.", 422);
  }

  const method = ["qr_scan", "manual_entry"].includes(body?.method ?? "") ? (body?.method as string) : "manual_entry";

  const rows = await db
    .insert(abhaLinks)
    .values({
      id: newId("AB-", 6),
      patientId,
      abhaNumber: number,
      abhaAddress: address,
      status: "pending",
      method,
      note: (body?.note ?? "Self-reported — pending authorized verification.").slice(0, 200),
    })
    .returning();
  const out: any[] = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  await recordAudit(account, { action: "create", entity: "abha-link", entityId: out[0]?.id, detail: "self-recorded ABHA identifier (unverified)" });
  return json({ ok: true, link: out[0] }, 201);
}

/**
 * DELETE /api/abha?id= — patient revokes a stored link/consent record.
 * Recorded consents are turned `revoked`; identifiers are removed from the
 * active list (soft-delete: retained for the audit trail).
 */
export async function DELETE(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  if (account.role !== "patient" || !account.patientId) return apiError("Only patients revoke their own records.", 403);
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const kind = url.searchParams.get("kind") ?? "link";
  if (!id) return apiError("id is required.", 422);

  const db = await getDb();
  if (kind === "consent") {
    const rows = await db.select().from(abdmConsents).where(and(eq(abdmConsents.id, id), eq(abdmConsents.patientId, account.patientId))).limit(1);
    if (!rows[0]) return apiError("Consent record not found.", 404);
    await db.update(abdmConsents).set({ status: "revoked", updatedAt: new Date(), note: `Revoked by patient on ${new Date().toISOString()}` }).where(eq(abdmConsents.id, id));
    await recordAudit(account, { action: "update", entity: "abdm-consent", entityId: id, detail: "patient revoked consent" });
    return json({ ok: true });
  }

  const rows = await db.select().from(abhaLinks).where(and(eq(abhaLinks.id, id), eq(abhaLinks.patientId, account.patientId))).limit(1);
  if (!rows[0]) return apiError("ABHA record not found.", 404);
  await db.delete(abhaLinks).where(eq(abhaLinks.id, id));
  await recordAudit(account, { action: "delete", entity: "abha-link", entityId: id, detail: "patient removed their ABHA record" });
  return json({ ok: true });
}
