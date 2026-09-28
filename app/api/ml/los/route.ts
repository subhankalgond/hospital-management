import { json, apiError, readJson, requireAccount } from "@/lib/server/api";
import { predictLos, type LosFeatures } from "@/lib/ml/los";

/**
 * POST /api/ml/los — predict length of stay for an admission profile.
 * Body: LosFeatures. Returns predicted LOS days + expected discharge date.
 * Staff-only (admin / doctor), matching the rest of the clinical APIs.
 */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  if (guard.account.role !== "admin" && guard.account.role !== "doctor") {
    return apiError("Only staff can run LOS predictions.", 403);
  }

  const body = await readJson<{
    age?: number;
    gender?: LosFeatures["gender"];
    priority?: LosFeatures["priority"];
    emergency?: boolean;
    comorbidityCount?: number;
    admissionIcu?: boolean;
    wardType?: LosFeatures["wardType"];
    nightAdmission?: boolean;
    weekendAdmission?: boolean;
    admissionDate?: string;
  }>(req);
  if (!body) return apiError("Invalid JSON body", 400);

  const age = Number(body.age);
  if (!Number.isFinite(age) || age < 0 || age > 120) {
    return apiError("age must be a number between 0 and 120", 400);
  }
  const comorbidityCount = Number(body.comorbidityCount ?? 0);
  if (!Number.isFinite(comorbidityCount) || comorbidityCount < 0 || comorbidityCount > 20) {
    return apiError("comorbidityCount must be a number between 0 and 20", 400);
  }

  const features: LosFeatures = {
    age,
    gender: body.gender ?? "other",
    priority: body.priority ?? "MODERATE",
    emergency: Boolean(body.emergency),
    comorbidityCount,
    admissionIcu: Boolean(body.admissionIcu),
    wardType: body.wardType ?? "semi-private",
    nightAdmission: Boolean(body.nightAdmission),
    weekendAdmission: Boolean(body.weekendAdmission),
  };

  const prediction = predictLos(features);
  // If an explicit admission date is provided, compute discharge from it.
  if (body.admissionDate) {
    const d = new Date(body.admissionDate);
    if (!Number.isNaN(d.getTime())) {
      const disc = new Date(d);
      disc.setDate(disc.getDate() + Math.ceil(prediction.losDays));
      prediction.expectedDischargeDate = disc.toISOString().slice(0, 10);
    }
  }
  return json(prediction);
}
