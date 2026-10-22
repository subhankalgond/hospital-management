/**
 * E2E smoke test — runs against a live dev/production server.
 * Usage: node scripts/e2e-smoke.mjs [baseUrl]
 *
 * Creates throwaway accounts (e2e+<ts>@example.com), then walks:
 *   1. Patient signup → permanent unique Patient ID (format + stability)
 *   2. Doctor signup → prescription with idempotency key, retry = no duplicates
 *   3. Pharmacy: verify → dispense (workflow + no double dispensing)
 *   4. Lab order → lab workflow: collect → process → result → verify
 *   5. Billable items exist for both orders; order/billing statuses separate
 *   6. Patient cannot act on staff roles (401/403 checks)
 *
 * All records are new isolated rows; nothing pre-existing is touched.
 */
/* eslint-disable no-console */
const BASE = process.argv[2] ?? "http://localhost:3210";
const ts = Date.now();
let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : "")); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

function jar() {
  let cookie = "";
  return {
    get() { return cookie; },
    set(c) { cookie = c; },
  };
}

async function call(session, path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(session.get() ? { cookie: session.get() } : {}),
      ...(opts.headers ?? {}),
    },
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const kv = c.split(";")[0];
    if (kv.startsWith("carepulse_session=")) session.set(kv);
  }
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { /* html or empty */ }
  return { status: res.status, data, text };
}

const patient = jar();
const doctor = jar();
const pharmacy = jar();
const lab = jar();
const stranger = jar();

const stamp = (label) => `e2e-${ts}-${label}@example.com`;

console.log("\n1) Patient signup → permanent Patient ID");
{
  const r = await call(patient, "/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      role: "patient",
      name: "Smoke Test Patient",
      email: stamp("patient"),
      password: "Str0ngPass!2026",
      phone: "0300-1234567",
      dob: "1991-05-20",
      gender: "female",
    }),
  });
  check("signup 200", r.status === 200 && r.data?.ok, `status=${r.status} body=${r.text.slice(0, 120)}`);
  const code = r.data?.patientCode;
  check("Patient ID符合 format PAT-YYYY-NNNNNN", /^PAT-\d{4}-\d{6}$/.test(code ?? ""), `got ${code}`);
  globalThis.__patientCode = code;
  globalThis.__patientPid = r.data?.patientId;
}

console.log("\n2) Patient ID stability across repeated loads + second session");
{
  const s1 = await call(patient, "/api/state");
  const me1 = (s1.data?.patients ?? []).find((x) => x.id === globalThis.__patientPid);
  const code1 = me1?.patientCode;
  const s2 = await call(patient, "/api/state");
  const me2 = (s2.data?.patients ?? []).find((x) => x.id === globalThis.__patientPid);
  const code2 = me2?.patientCode;
  check("first load returns the code", code1 === globalThis.__patientCode, `got ${code1}`);
  check("repeat load returns the same code (immutable)", code2 === code1, `got ${code2}`);
  // sign out, sign back in — the ID must not change
  await call(patient, "/api/auth/signout", { method: "POST" });
  patient.set("");
  const li = await call(patient, "/api/auth/signin", {
    method: "POST",
    body: JSON.stringify({ email: stamp("patient"), password: "Str0ngPass!2026" }),
  });
  check("re-signin ok", li.status === 200 && li.data?.ok, `status=${li.status}`);
  const s3 = await call(patient, "/api/state");
  const code3 = (s3.data?.patients ?? []).find((x) => x.id === globalThis.__patientPid)?.patientCode;
  check("same code after sign-out/sign-in", code3 === globalThis.__patientCode, `got ${code3}`);
}

console.log("\n3) Doctor signup → new prescription with idempotency");
{
  const r = await call(doctor, "/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      role: "doctor",
      name: "Dr Smoke Tester",
      email: stamp("doctor"),
      password: "Str0ngPass!2026",
      phone: "0321-7654321",
      qualification: "MBBS",
      licenseNo: `PMC-${ts}`,
      specialty: "General Medicine",
      department: "General Medicine",
      experienceYears: 3,
      shift: "morning",
    }),
  });
  check("doctor signup 200", r.status === 200 && r.data?.ok, `status=${r.status} body=${r.text.slice(0, 120)}`);
  globalThis.__doctorId = r.data?.doctorId;

  const pid = globalThis.__patientPid;
  globalThis.__idem = `${ts}a1b2c3d4e5f60718293a4b5c6d7e8f9`.slice(0, 32);
  const body = JSON.stringify({
    patientId: pid,
    items: [
      {
        drug: "Paracetamol 500mg",
        dosage: "500 mg",
        route: "oral",
        frequency: "3× daily",
        durationDays: 5,
        quantity: 15,
        instructions: "after meals",
      },
    ],
    idemKey: globalThis.__idem,
  });
  const p1 = await call(doctor, "/api/prescriptions", { method: "POST", body });
  check("prescription ok", p1.status === 201 || p1.status === 200, `status=${p1.status} body=${p1.text.slice(0, 200)}`);
  check("exactly one order id returned", (p1.data?.orderIds ?? []).length === 1, JSON.stringify(p1.data?.orderIds));
  globalThis.__orderId = p1.data?.orderIds?.[0];

  // double-click / network retry: same idemKey must not create a second order
  const p2 = await call(doctor, "/api/prescriptions", { method: "POST", body });
  check(
    "retry with same idemKey is a duplicate, not a new order",
    (p2.data?.duplicate === true || p2.status < 300) && (p2.data?.orderIds ?? [p2.data?.orderId]).length === 1,
    JSON.stringify(p2.data)
  );
  const ps = await call(doctor, "/api/state");
  const orderCount = (ps.data?.medicationOrders ?? []).filter(
    (o) => o.drug === "Paracetamol 500mg" && o.patientId === globalThis.__patientPid
  ).length;
  check("exactly 1 medication order persisted", orderCount === 1, `count=${orderCount}`);

  // wrong patient reference
  const bad = await call(doctor, "/api/prescriptions", {
    method: "POST",
    body: JSON.stringify({ patientId: "P-doesnotexist999", items: [{ drug: "X", dosage: "1", frequency: "1x", durationDays: 1 }], idemKey: `${ts}ffeeddccbbaa99887766554433221100` }),
  });
  check("unknown patient rejected (404)", bad.status === 404, `status=${bad.status}`);
}

console.log("\n3b) Pharmacy & laboratory staff accounts");
{
  for (const [sess, role, label] of [[pharmacy, "pharmacy", "pharmacist"], [lab, "lab", "laboratory"]]) {
    const r = await call(sess, "/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        role,
        name: `Smoke ${label} staff`,
        email: stamp(role),
        password: "Str0ngPass!2026",
        phone: "0311-0000000",
      }),
    });
    check(`${label} signup 200`, r.status === 200 && r.data?.ok, `status=${r.status} body=${r.text.slice(0, 120)}`);
  }
}

console.log("\n4) Pharmacy workflow — no dispensing without verification");
{
  const orderId = globalThis.__orderId;
  const pre = await call(doctor, "/api/pharmacy/" + orderId, { method: "PATCH", body: JSON.stringify({ action: "dispense" }) });
  check("doctor cannot dispense (403)", pre.status === 403, `status=${pre.status}`);

  const disp0 = await call(pharmacy, "/api/pharmacy/" + orderId, { method: "PATCH", body: JSON.stringify({ action: "dispense" }) });
  check("dispense without verify rejected (409)", disp0.status === 409, `status=${disp0.status}`);

  const verify = await call(pharmacy, "/api/pharmacy/" + orderId, { method: "PATCH", body: JSON.stringify({ action: "verify", note: "checked dose" }) });
  check("pharmacist verify ok", verify.status === 200, `status=${verify.status} body=${verify.text.slice(0, 200)}`);

  const disp = await call(pharmacy, "/api/pharmacy/" + orderId, { method: "PATCH", body: JSON.stringify({ action: "dispense" }) });
  check("dispense ok after verification", disp.status === 200, `status=${disp.status}`);

  const again = await call(pharmacy, "/api/pharmacy/" + orderId, { method: "PATCH", body: JSON.stringify({ action: "dispense" }) });
  check("second dispense rejected (409) — no duplicate dispensing", again.status === 409, `status=${again.status}`);

  const st = await call(doctor, "/api/state");
  const order = (st.data?.medicationOrders ?? []).find((o) => o.id === orderId);
  check("order status is dispensed", order?.status === "dispensed", `status=${order?.status}`);
  check("pharmacist recorded on order", Boolean(order?.verifiedByName && order?.dispensedByName), JSON.stringify(order?.dispensedByName));
}

console.log("\n5) Superbill: medication order auto-billed");
{
  const st = await call(doctor, "/api/state");
  const item = (st.data?.invoiceItems ?? []).find((i) => i.sourceOrderId === globalThis.__orderId && i.sourceType === "medication");
  check("billable item exists for the order", Boolean(item), JSON.stringify(st.data?.invoiceItems?.slice(0, 3)));
  check("billable status distinct from order status", item ? ["billed", "awaiting_price"].includes(item.status) : false, `status=${item?.status}`);
  check("unit price not invented or zero-charged silently", item ? (item.amount > 0 || item.status === "awaiting_price") : false, `amount=${item?.amount}`);
}

console.log("\n6) Lab order → Laboratory Panel workflow");
{
  const r = await call(doctor, "/api/labs", {
    method: "POST",
    body: JSON.stringify({ patientId: globalThis.__patientPid, test: "Complete Blood Count", priority: "routine", clinicalNote: "baseline CBC" }),
  });
  check("lab order ok", r.status === 201 || r.status === 200, `status=${r.status} body=${r.text.slice(0, 200)}`);
  const labId = r.data?.id ?? r.data?.orderId;
  globalThis.__labId = labId;
  check("lab id returned", Boolean(labId));

  const empty = await call(lab, "/api/labs/" + labId, { method: "PATCH", body: JSON.stringify({ action: "result", result: "" }) });
  check("empty result rejected (422)", empty.status === 422, `status=${empty.status}`);

  const c = await call(lab, "/api/labs/" + labId, { method: "PATCH", body: JSON.stringify({ action: "collect" }) });
  check("sample collected", c.status === 200, `status=${c.status} body=${c.text.slice(0, 150)}`);
  const p = await call(lab, "/api/labs/" + labId, { method: "PATCH", body: JSON.stringify({ action: "process" }) });
  check("processing", p.status === 200, `status=${p.status}`);
  const rv = await call(lab, "/api/labs/" + labId, { method: "PATCH", body: JSON.stringify({ action: "result", result: "Hb 12.1 g/dL; WBC 6.8 ×10⁹/L; Plt 250 ×10⁹/L" }) });
  check("result recorded", rv.status === 200, `status=${rv.status} body=${rv.text.slice(0, 150)}`);
  const v = await call(lab, "/api/labs/" + labId, { method: "PATCH", body: JSON.stringify({ action: "verify" }) });
  check("result verified", v.status === 200, `status=${v.status}`);

  const st = await call(doctor, "/api/state");
  const L = (st.data?.labs ?? []).find((l) => l.id === labId);
  check("doctor sees verified result", L?.workflow === "verified" && Boolean(L?.result), `wf=${L?.workflow}`);
  const labItem = (st.data?.invoiceItems ?? []).find((i) => i.sourceOrderId === labId && i.sourceType === "lab");
  check("billable item exists for the lab order", Boolean(labItem), JSON.stringify(st.data?.invoiceItems?.slice(0, 3)));
}

console.log("\n7) Role isolation");
{
  const s = await call(stranger, "/api/state");
  check("anonymous access rejected", s.status === 401, `status=${s.status}`);

  const med = await call(patient, "/api/pharmacy/" + globalThis.__orderId, { method: "PATCH", body: JSON.stringify({ action: "verify" }) });
  check("patient cannot verify prescriptions", [401, 403].includes(med.status), `status=${med.status}`);

  const labAct = await call(patient, "/api/labs/" + globalThis.__labId, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) });
  check("patient cannot cancel lab orders", [401, 403].includes(labAct.status), `status=${labAct.status}`);
}

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
if (failures.length) {
  console.log("Failures:");
  for (const f of failures) console.log("  - " + f);
}
process.exit(fail ? 1 : 0);
