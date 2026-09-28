/**
 * End-to-end verification of the Emergency Center + Bed Management flows.
 * Usage: node scripts/verify-emergency.mjs   (dev server on :3210)
 * Leaves test data in place only if it fails partway — deletes what it creates.
 */
const base = "http://localhost:3210";
const fs = await import("node:fs");

const log = (...a) => console.log(...a);

async function main() {
  // 0. admin session
  const code = fs.readFileSync(".env.local", "utf8").match(/ADMIN_ACCESS_CODE=(.*)/)?.[1]?.trim() || "CAREPULSE";
  const su = await fetch(base + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin", name: "E2E Admin", email: "e2e-admin@test.dev", password: "testpass123", accessCode: code }),
  });
  const cookie = (su.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  log("1. admin signup:", su.status);
  if (su.status === 409) {
    // exists: sign in instead
    const si = await fetch(base + "/api/auth/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "e2e-admin@test.dev", password: "testpass123" }) });
    cookie = (si.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  }

  const j = async (r) => r.json();
  const post = (url, body) => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(body) }).then(j);
  const patch = (url, body) => fetch(base + url, { method: "PATCH", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(body) }).then(j);

  // 2. register emergency case (walk-in, critical vitals)
  const cs = await post("/api/emergencies", {
    walkIn: { name: "E2E Patient", age: 70, gender: "female", contactName: "Sam", contactPhone: "555" },
    symptoms: "crushing chest pain",
    vitals: { hr: 125, bp: "88/54", spo2: 88, rr: 31, tempC: 39.7, glucose: 430, consciousness: "verbal" },
    trauma: false,
    department: "Cardiology",
  });
  const eid = cs.id;
  log("2. case created:", eid);

  // 3. triage — expect CRITICAL
  const tr = await patch("/api/emergencies/" + eid, { action: "triage" });
  log("3. triage:", tr.triage.aiPriority, "|", tr.triage.riskIndicators.slice(0, 3).join("; "));

  // 4. staff override with reason
  await patch("/api/emergencies/" + eid, { action: "priority", priority: "URGENT", reason: "Vitals improved after O2" });

  // 5. bed recommendation + reserve
  const rec = await post("/api/beds/recommend", { emergencyCaseId: eid, priority: "URGENT" });
  log("4. recommended bed:", rec.bed?.label, rec.bed?.type);
  const rs = await post("/api/beds/states", { action: "reserve", bedId: rec.bed.id, emergencyCaseId: eid });
  log("   reserve:", JSON.stringify(rs));

  // 6. occupy + admit
  const oc = await post("/api/beds/states", { action: "occupy", bedId: rec.bed.id });
  const adm = await patch("/api/emergencies/" + eid, { action: "status", status: "admitted" });
  log("5. occupy+admit:", JSON.stringify(oc), JSON.stringify(adm));

  // 7. turnaround flow
  for (const a of ["discharge", "start-cleaning", "inspect", "release"]) {
    const r = await post("/api/beds/states", { action: a, bedId: rec.bed.id });
    log("6.", a, "->", r.status ?? r.error);
  }

  // 8. stored case + audit
  const st = await fetch(base + "/api/state", { headers: { cookie } }).then(j);
  const tc = st.emergencies.find((c) => c.id === eid);
  log("7. stored case:", tc.id, "| final:", tc.priority, "| reviewer:", tc.reviewer, "| reason:", tc.reasonForChange, "| status:", tc.status);
  log("   audit rows:", st.bedAudit.filter((a) => a.bedId === rec.bed.id).length, "| beds:", st.beds.length, "| cases:", st.emergencies.length);

  return { eid, bedId: rec.bed?.id };
}

const result = await main();
fs.writeFileSync(".freebuff/e2e-ids.json", JSON.stringify(result));
log("done — ids saved to .freebuff/e2e-ids.json");
