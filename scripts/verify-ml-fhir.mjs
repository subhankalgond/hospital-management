/**
 * E2E verification for the ML + FHIR layer. Creates a throwaway admin
 * account, exercises every new endpoint, then deletes the account.
 *
 *   node scripts/verify-ml-fhir.mjs [baseUrl]
 */
// load .env.local so ADMIN_ACCESS_CODE / DATABASE_URL match the dev server
for (const line of (await import("node:fs")).readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const base = process.argv[2] ?? "http://localhost:3210";
let failures = 0;

function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

async function api(path, opts = {}, raw = false) {
  const res = await fetch(base + path, opts);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

const EMAIL = `e2e-ml-${Date.now().toString(36)}@test.dev`;
let cookie = "";

// ── 0. admin signup ──
{
  const r = await api("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin", name: "E2E ML Admin", email: EMAIL, password: "test-1234", accessCode: process.env.ADMIN_ACCESS_CODE ?? "CAREPULSE-ADMIN-2026" }),
  });
  const setCookie = r.headers.get("set-cookie") ?? "";
  cookie = setCookie.split(";")[0];
  check("admin signup", r.status === 200 || r.status === 201, `status ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
}

// ── 1. FHIR ──
let fhirPatientId = "";
{
  const meta = await api("/api/fhir/metadata");
  check("FHIR metadata", meta.status === 200 && meta.body.resourceType === "CapabilityStatement");

  const created = await api("/api/fhir/Patient", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      resourceType: "Patient",
      name: [{ text: "FHIR E2E Patient", family: "Patient", given: ["FHIR", "E2E"] }],
      gender: "female",
      birthDate: "1988-03-14",
      telecom: [{ system: "email", value: `fhir-${Date.now().toString(36)}@test.dev` }],
    }),
  });
  check("FHIR Patient create", created.status === 201 && created.body.resourceType === "Patient", `status ${created.status}`);
  fhirPatientId = created.body?.id ?? "";
  check("FHIR Patient has identifier + name", Boolean(created.body?.identifier?.length && created.body?.name?.[0]?.family));

  const search = await api(`/api/fhir/Patient?name=FHIR`, { headers: { Cookie: cookie } });
  check("FHIR Patient search Bundle", search.status === 200 && search.body.resourceType === "Bundle" && search.body.total >= 1, `total=${search.body?.total}`);

  const read = await api(`/api/fhir/Patient/${fhirPatientId}`, { headers: { Cookie: cookie } });
  check("FHIR Patient read by id", read.status === 200 && read.body.birthDate === "1988-03-14");

  const missing = await api(`/api/fhir/Patient/does-not-exist`, { headers: { Cookie: cookie } });
  check("FHIR 404 → OperationOutcome", missing.status === 404 && missing.body.resourceType === "OperationOutcome");
}

// ── 2. LOS ──
{
  const r = await api("/api/ml/los", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ age: 70, gender: "male", priority: "CRITICAL", emergency: true, comorbidityCount: 4, admissionIcu: true, wardType: "icu" }),
  });
  const los = r.body;
  check("LOS critical ICU predicts longer stay", r.status === 200 && los.losDays > 8, `losDays=${los?.losDays}`);
  check("LOS returns discharge date + metrics", Boolean(los?.expectedDischargeDate && los?.metrics?.mae));
  check("LOS disclaimer present", Boolean(los?.disclaimer));

  const low = await api("/api/ml/los", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ age: 25, gender: "female", priority: "LOW", comorbidityCount: 0, wardType: "private" }),
  });
  check("LOS low-risk shorter stay", low.body?.losDays < los.losDays, `${low.body?.losDays} < ${los.losDays}`);

  const bad = await api("/api/ml/los", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ age: 999 }),
  });
  check("LOS rejects invalid input", bad.status === 400);
}

// ── 3. NLP ──
{
  const cases = [
    // urgency terms win and steer to the Emergency Center (by design)
    ["crushing chest pain and sweating since morning", "Emergency Center", true],
    ["knee pain when climbing stairs", "Orthopedics", false],
    ["my daughter has fever and rash", "Pediatrics", false],
    ["feel very anxious and cannot sleep", "Psychiatry", false],
    ["ear blocked after cold", "ENT", null],
    ["blurred vision when reading", "Ophthalmology", null],
    ["unconscious not responding", null, true],
    // real-world phrasings (post-retrain gold set samples)
    ["chest feels heavy when walking fast or after climbing stairs", "Cardiology", null],
    ["my 4 year old has loose motions for 2 days i give ors but it keeps coming back", "Pediatrics", null],
    ["ring shaped itchy patch spreading on the neck", "Dermatology", null],
    ["migraine attacks twice a week with light sensitivity", "Neurology", null],
    ["exam pressure through the roof, student anxious", "Psychiatry", null],
    ["right ear fluid, feels full since morning", "ENT", null],
    ["hazy vision, light glare, cataract in one eye", "Ophthalmology", null],
    ["periods painful with vomiting each cycle", "Gynecology", null],
    ["weak stream while passing urine since months", "General Medicine", null],
    ["pet dard ho raha hai", "General Medicine", null],
    ["ghutne me dard hai", "Orthopedics", null],
    ["kaan me dard hai", "ENT", null],
    ["mahwari me dard", "Gynecology", null],
    ["thunderclap headache, worst of my life", "Emergency Center", null],
  ];
  for (const [text, dept, emergency] of cases) {
    const r = await api("/api/nlp/symptoms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ text }),
    });
    const okDept = dept === null ? true : r.body?.department === dept;
    const okUrg = emergency === null ? true : r.body?.urgency?.isEmergency === emergency;
    check(`NLP "${text.slice(0, 32)}…"`, r.status === 200 && okDept && okUrg,
      `→ ${r.body?.department}${r.body?.urgency?.isEmergency ? " (EMERGENCY)" : ""}`);
  }
}

// ── 4. demo doctor accounts (2 per department, shared password) ──
{
  const demo = [
    ["anil.mehta@demo.carepulse", "Cardiology"],
    ["farhan.qureshi@demo.carepulse", "Neurology"],
    ["meera.deshpande@demo.carepulse", "Pediatrics"],
    ["lakshmi.gupta@demo.carepulse", "Gynecology"],
    ["rakesh.talwar@demo.carepulse", "General Medicine"],
  ];
  let cookie2 = "";
  for (const [email, dept] of demo) {
    const r = await api("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "Demo@12345" }),
    });
    const setCookie = r.headers.get("set-cookie") ?? "";
    if (setCookie) cookie2 = setCookie.split(";")[0];
    check(`demo signin ${email}`, r.status === 200 && r.body?.ok === true && String(r.body?.name || "").includes("(Demo)"),
      `→ ${r.body?.name ?? "?"} (${r.body?.role ?? "?"})`);
    // the signed-in demo doctor must be able to use the NLP router
    if (cookie2) {
      const nlp = await api("/api/nlp/symptoms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie2 },
        body: JSON.stringify({ text: `sugar 300 after lunch feel thirsty always` }),
      });
      check(`demo ${email.split("@")[0]} uses NLP router`, nlp.status === 200 && Boolean(nlp.body?.department), `→ ${nlp.body?.department}`);
    }
  }
  // wrong password must fail for demo accounts too
  const bad = await api("/api/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "anil.mehta@demo.carepulse", password: "wrong-password" }),
  });
  check("demo wrong password rejected", bad.status === 401);
}

// ── cleanup ──
{
  const { default: postgres } = await import("postgres");
  for (const line of (await import("node:fs")).readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 20 });
  await sql`delete from patients where name = 'FHIR E2E Patient'`;
  await sql`delete from sessions where account_id in (select id from accounts where email = ${EMAIL})`;
  await sql`delete from accounts where email = ${EMAIL}`;
  await sql.end();
  console.log("cleanup: e2e admin + FHIR patient removed");
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
