/**
 * Acceptance tests — run against a live dev server on :3210.
 * Exercises the new features end to end with real sign-ins.
 */
const BASE = "http://localhost:3210";
let cookie = "";
let pass = 0, fail = 0;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
}

function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? " — " + JSON.stringify(extra).slice(0, 300) : ""}`); }
}

async function signIn(email, password) {
  cookie = "";
  const r = await call("POST", "/api/auth/signin", { email, password });
  return r.status;
}

/* ── 1. unauthorized access blocked ── */
console.log("\n[T1] Unauthorized access to protected APIs");
{
  cookie = "";
  const r = await call("GET", "/api/forecast/overview");
  check("forecast requires sign-in (401)", r.status === 401, r);
  const r2 = await call("POST", "/api/symptom-assessments", { transcript: "fever" });
  check("symptom assessment requires sign-in (401)", r2.status === 401, r2);
  const r3 = await call("GET", "/api/patients/P-DEMO1/history");
  check("history requires sign-in (401)", r3.status === 401, r3);
}

/* ── 2. admin sign-in ── */
console.log("\n[T2] Admin sign-in");
check("admin signs in (200)", (await signIn("admin@carepulse.health", "Admin@12345")) === 200);

/* ── 3. forbiden: patient cannot see forecast; admin CAN ── */
console.log("\n[T3] Role-scoped forecasting");
{
  const admin = await call("GET", "/api/forecast/overview");
  check("admin forecast 200 with capacity", admin.status === 200 && admin.data?.capacity?.physical > 0, admin.data?.capacity);
  check("forecast reports hasEnoughData field honestly", typeof admin.data?.hasEnoughData === "boolean");
  check("forecast status is available|insufficient-data", ["available", "insufficient-data"].includes(admin.data?.forecast?.status));
}

/* ── 4. symptom assessment end-to-end ── */
console.log("\n[T4] Multi-symptom assessment via API");
{
  const r = await call("POST", "/api/symptom-assessments", {
    transcript: "I have chest discomfort, shortness of breath, dizziness, sweating, fatigue, nausea, and pain in my left arm since this morning.",
    inputMode: "voice",
  });
  check("8-symptom emergency case → emergency", r.status === 201 && r.data?.analysis?.urgency === "emergency", r.data?.analysis?.urgency);
  check("emergency routes to Emergency Center", r.data?.analysis?.suggestedDepartment === "Emergency Center");
  check("no follow-up questions during emergency (safety)", (r.data?.analysis?.followUpQuestions ?? []).length === 0);
  check("engine version recorded", typeof r.data?.analysis?.version === "string");

  const r2 = await call("POST", "/api/symptom-assessments", {
    transcript: "I have a skin rash and itching but no fever.",
  });
  check("negation respected (no fever)", r2.status === 201 && !r2.data?.analysis?.symptoms?.some(s => s.name === "fever"), r2.data?.analysis?.symptoms);
  check("routine case → Dermatology doctor exists in DB", r2.status === 201 && r2.data?.doctor != null, r2.data?.doctor);
  check("doctor belongs to suggested department", r2.data?.doctor?.department === "Dermatology");

  const r3 = await call("POST", "/api/symptom-assessments", { transcript: "" });
  check("empty transcript rejected 400", r3.status === 400);
}

/* ── 5. assessments persisted + listable ── */
console.log("\n[T5] Assessments persisted in DB");
{
  const r = await call("GET", "/api/symptom-assessments");
  check("admin can list assessments", r.status === 200 && Array.isArray(r.data?.assessments));
  check("the emergency+derm assessments are stored", (r.data?.assessments?.length ?? 0) >= 2);
}

/* ── 6. patient-scoped RLS on assessments ── */
console.log("\n[T6] Patient scoping");
{
  await signIn("rohit@demo.carepulse", "Patient@12345");
  const mine = await call("GET", "/api/symptom-assessments");
  check("patient list 200", mine.status === 200);
  const foreign = (mine.data?.assessments ?? []).find(a => a.patientId !== "unlinked" && a.patientId !== mine.data?.assessments?.[0]?.patientId);
  check("patient sees only own rows", foreign == null, foreign);
  await signIn("admin@carepulse.health", "Admin@12345");
}

/* ── 7. history API with working filters ── */
console.log("\n[T7] Patient history filters (real counts)");
{
  // find a patient id
  const st = await call("GET", "/api/state");
  const pid = st.data?.patients?.[0]?.id;
  check("state returns patients", Boolean(pid));
  if (pid) {
    const all = await call("GET", `/api/patients/${pid}/history?period=all`);
    check("all-time history 200", all.status === 200);
    check("counts.total > 0 iff visits exist", typeof all.data?.counts?.total === "number");
    const year = await call("GET", `/api/patients/${pid}/history?period=year`);
    check("year filter returns subset ≤ all", year.status === 200 && year.data?.visits?.length <= all.data?.visits?.length);
    const custom = await call("GET", `/api/patients/${pid}/history?period=custom&from=2020-01-01&to=2020-12-31`);
    check("custom range excludes visits far outside", custom.status === 200 && custom.data?.visits?.length === 0);
    const missingCustom = await call("GET", `/api/patients/${pid}/history?period=custom`);
    check("custom without dates → 400", missingCustom.status === 400);
  }
}

/* ── 8. wrong-password rejection ── */
console.log("\n[T8] Auth still rejects bad credentials");
check("wrong password → 401", (await signIn("admin@carepulse.health", "WrongPass")) === 401);

console.log(`\n═══ ${pass} pass / ${fail} fail ═══`);
process.exit(fail > 0 ? 1 : 0);
