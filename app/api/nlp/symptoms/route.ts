import { json, apiError, readJson, requireAccount } from "@/lib/server/api";
import { routeSymptoms, isLikelyEmergency } from "@/lib/nlp/symptoms";

/**
 * POST /api/nlp/symptoms — route free-text symptoms to a department.
 * Body: { text: string }.
 *
 * Open to any signed-in account (patients use it while booking; staff use it
 * in the Emergency Center). Read-only inference, no DB writes.
 */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;

  const body = await readJson<{ text?: string }>(req);
  if (!body) return apiError("Invalid JSON body", 400);
  const text = (body.text ?? "").trim();
  if (!text) return apiError("text is required", 400);
  if (text.length > 600) return apiError("text too long (max 600 chars)", 400);

  const routing = routeSymptoms(text);
  return json(routing);
}

/** GET — quick health/metadata probe for the router. */
export async function GET() {
  return json({
    service: "symptom-router",
    version: 1,
    ready: true,
    emergencyDetection: isLikelyEmergency("crushing chest pain and sweating"),
  });
}
