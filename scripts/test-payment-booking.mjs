/**
 * Comprehensive test script for Payment & Booking Integration,
 * Role Permissions, Idempotency, Slot Locking, and Signature Verification.
 */
import crypto from "node:crypto";
import postgres from "postgres";

const BASE = "http://localhost:3210";
let pass = 0;
let fail = 0;

function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ✓ PASS: ${name}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${name}${extra ? " — " + JSON.stringify(extra).slice(0, 300) : ""}`);
  }
}

async function api(method, path, body, cookie = "") {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  const setCookie = res.headers.get("set-cookie");
  return { status: res.status, data, cookie: setCookie ? setCookie.split(";")[0] : cookie };
}

async function main() {
  console.log("=== CarePulse Payment & Booking Automated Test Suite ===\n");

  // Step 1: Discover available doctor & patient from DB
  const sql = postgres(process.env.DATABASE_URL, { prepare: false });
  // Clean up any lingering test appointments on test date
  await sql`delete from appointments where date = '2026-11-20'`;
  const docs = await sql`select id, name, department from doctors limit 1`;
  const doctor = docs[0];
  const pts = await sql`select id, name from patients limit 1`;
  const patient = pts[0];
  await sql.end();

  if (!doctor || !patient) {
    throw new Error("No doctor or patient found in DB to test against.");
  }
  console.log(`Using Doctor: ${doctor.name} (${doctor.id}, ${doctor.department})`);
  console.log(`Using Patient: ${patient.name} (${patient.id})\n`);

  // Step 2: Authentication
  console.log("[1] Authentication & Role Identification");
  const patientAuth = await api("POST", "/api/auth/signin", {
    email: "rohit@demo.carepulse",
    password: "Patient@12345",
  });
  check("Patient signs in successfully (200)", patientAuth.status === 200);
  const patientCookie = patientAuth.cookie;

  const adminAuth = await api("POST", "/api/auth/signin", {
    email: "admin@carepulse.health",
    password: "Admin@12345",
  });
  check("Admin signs in successfully (200)", adminAuth.status === 200);
  const adminCookie = adminAuth.cookie;

  // Step 3: Payment Configuration Check (Authenticated)
  console.log("\n[2] Payment Configuration & Currency Units");
  const cfg = await api("GET", "/api/payments", null, patientCookie);
  check("Payment endpoint responds 200", cfg.status === 200);
  check("Razorpay key configured", typeof cfg.data?.keyId === "string" && cfg.data.keyId.startsWith("rzp_test_"));
  check("Fee configured as ₹500", cfg.data?.feeRupees === 500);
  check("Currency is INR", cfg.data?.currency === "INR");

  // Step 4: Patient Booking Flow: Slot Hold & Gateway Order Creation
  console.log("\n[3] Patient Booking Flow: Slot Hold & Gateway Order Creation");
  const testDate = "2026-11-20";
  const testTime = "10:00";

  const bookRes = await api("POST", "/api/appointments", {
    doctorId: doctor.id,
    date: testDate,
    time: testTime,
    reason: "Routine clinical consultation",
  }, patientCookie);

  check("Patient booking initiates with requiresPayment=true (200)", bookRes.status === 200 && bookRes.data?.requiresPayment === true, bookRes.data);
  const apptId = bookRes.data?.id;
  const orderId = bookRes.data?.checkout?.orderId;
  const amountPaise = bookRes.data?.checkout?.amount;
  check("Razorpay order created with 50000 paise (₹500)", amountPaise === 50000, amountPaise);
  check("Valid Razorpay order ID generated", typeof orderId === "string" && orderId.startsWith("order_"));

  // Step 5: Slot Collision Prevention: Another booking attempt for the same slot must fail
  console.log("\n[4] Slot Locking & Race Condition Prevention");
  const conflictRes = await api("POST", "/api/appointments", {
    doctorId: doctor.id,
    patientId: "P-ms6e4i", // Meera Iyer (different patient attempting to book the held slot)
    date: testDate,
    time: testTime,
    reason: "Trying to take same slot simultaneously",
  }, adminCookie);
  check("Simultaneous booking blocked with 409 conflict", conflictRes.status === 409, conflictRes.data);

  // Step 6: Server-Side Razorpay Signature Verification
  console.log("\n[5] Server-Side Razorpay Signature Verification");
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const mockRzpPaymentId = `pay_test_${Date.now()}`;
  const validSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${mockRzpPaymentId}`)
    .digest("hex");

  // Invalid signature test first
  const invalidVerify = await api("PUT", "/api/payments", {
    orderId,
    paymentId: mockRzpPaymentId,
    signature: "invalid_tampered_signature_123",
  }, patientCookie);
  check("Tampered payment signature rejected with 400", invalidVerify.status === 400);

  // Valid signature verification
  const validVerify = await api("PUT", "/api/payments", {
    orderId,
    paymentId: mockRzpPaymentId,
    signature: validSignature,
  }, patientCookie);
  check("Valid payment signature verified (200)", validVerify.status === 200, validVerify.data);
  check("Payment verified returns confirmed appointment ID", validVerify.data?.appointmentId === apptId);

  // Step 7: Database Consistency After Verified Payment
  console.log("\n[6] Database Consistency After Verified Payment");
  const stateCheck = await api("GET", "/api/state", null, patientCookie);
  const apptInState = stateCheck.data?.appointments?.find((a) => a.id === apptId);
  check("Appointment status transitioned to 'confirmed'", apptInState?.status === "confirmed", apptInState);

  // Step 8: Role-Based Access Control Audit on Appointment Actions
  console.log("\n[7] Role-Based Access Control (RBAC)");
  // Patient tries to perform forbidden "confirm" action on appointment
  const patientHacking = await api("PATCH", `/api/appointments/${apptId}`, {
    action: "confirm",
  }, patientCookie);
  check("Patient forbidden from self-confirming (403)", patientHacking.status === 403, patientHacking.data);

  // Patient tries to perform forbidden "no-show" action
  const patientNoShow = await api("PATCH", `/api/appointments/${apptId}`, {
    action: "no-show",
  }, patientCookie);
  check("Patient forbidden from setting no-show (403)", patientNoShow.status === 403, patientNoShow.data);

  // Step 9: Administrative Booking Workflow (No Frontend Prepayment Required)
  console.log("\n[8] Administrative Booking Workflow (Bypasses Prepayment)");
  const adminBookDate = "2026-11-20";
  const adminBookTime = "14:00";
  const adminBooking = await api("POST", "/api/appointments", {
    patientId: patient.id,
    doctorId: doctor.id,
    date: adminBookDate,
    time: adminBookTime,
    reason: "Administrative referral booking",
  }, adminCookie);

  check("Admin can book immediately with status=confirmed (200)", adminBooking.status === 200 && adminBooking.data?.status === "confirmed", adminBooking.data);
  const adminApptId = adminBooking.data?.id;

  // Step 10: Cleanup of Test Appointments
  console.log("\n[9] Cleanup");
  if (apptId) {
    await api("PATCH", `/api/appointments/${apptId}`, { action: "cancel" }, patientCookie);
  }
  if (adminApptId) {
    await api("PATCH", `/api/appointments/${adminApptId}`, { action: "cancel" }, adminCookie);
  }
  console.log("  ✓ Test appointments cancelled to keep DB clean.");

  console.log(`\n========================================`);
  console.log(`Test Results: ${pass} passed, ${fail} failed.`);
  console.log(`========================================\n`);

  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
