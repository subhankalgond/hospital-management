/** Payload validation for the API (mirrors the old client-side rules). */
import type { SignUpInput } from "@/lib/types";

export const PASSWORD_MIN = 8;

export type Valid<T> = { ok: true; value: T } | { ok: false; error: string };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateSignUp(input: unknown): Valid<SignUpInput> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Invalid request body." };
  const raw = input as Record<string, unknown>;
  const role = str(raw.role);

  const base = {
    name: str(raw.name),
    email: str(raw.email).toLowerCase(),
    password: typeof raw.password === "string" ? raw.password : "",
  };

  if (!base.name) return { ok: false, error: "Name is required." };
  if (!validateEmail(base.email)) return { ok: false, error: "Please enter a valid email address." };
  if (base.password.length < PASSWORD_MIN) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN} characters.` };
  }

  if (role === "patient") {
    const phone = str(raw.phone);
    const dob = str(raw.dob);
    const gender = str(raw.gender);
    if (!phone || !dob) return { ok: false, error: "Phone and date of birth are required." };
    if (!["male", "female", "other"].includes(gender)) {
      return { ok: false, error: "Please choose a gender." };
    }
    if (Number.isNaN(new Date(dob).getTime())) {
      return { ok: false, error: "Date of birth is invalid." };
    }
    return {
      ok: true,
      value: { role: "patient", ...base, phone, dob, gender: gender as "male" | "female" | "other" },
    };
  }

  if (role === "doctor") {
    const phone = str(raw.phone);
    const qualification = str(raw.qualification);
    const licenseNo = str(raw.licenseNo);
    const specialty = str(raw.specialty);
    const department = str(raw.department);
    const shift = str(raw.shift);
    const experienceYears = Number(raw.experienceYears);
    const room = str(raw.room);

    if (!phone) return { ok: false, error: "Phone is required." };
    if (!qualification) return { ok: false, error: "Qualification is required for doctors." };
    if (!licenseNo) return { ok: false, error: "Medical license number is required." };
    if (!department || !specialty) return { ok: false, error: "Please choose a department and specialty." };
    if (!["morning", "evening", "night"].includes(shift)) {
      return { ok: false, error: "Please choose a shift." };
    }
    if (!Number.isFinite(experienceYears) || experienceYears < 0 || experienceYears > 80) {
      return { ok: false, error: "Years of experience must be between 0 and 80." };
    }
    return {
      ok: true,
      value: {
        role: "doctor",
        ...base,
        phone,
        qualification,
        licenseNo,
        specialty,
        department,
        experienceYears,
        shift: shift as "morning" | "evening" | "night",
        room,
      },
    };
  }

  if (role === "admin") {
    const accessCode = str(raw.accessCode);
    if (!accessCode) return { ok: false, error: "Administrator access code is required." };
    return { ok: true, value: { role: "admin", ...base, accessCode } };
  }

  return { ok: false, error: "Unknown account type." };
}
