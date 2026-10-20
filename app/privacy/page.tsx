import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — CarePulse",
  description: "How CarePulse handles patient and clinical data.",
};

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">CarePulse</p>
      <h1 className="mt-2 font-display text-3xl">Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Last updated: October 2026 · Applies to this CarePulse hospital management deployment.
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed">
        <section>
          <h2 className="font-display text-xl">1. What this system is</h2>
          <p className="mt-2">
            CarePulse is a hospital management platform used by hospitals to manage patient
            registrations, appointments, clinical encounters, prescriptions, labs, ward beds, and
            billing. It also provides AI-assisted decision-support features (symptom routing and
            length-of-stay forecasting) that are explicitly labeled as preliminary — they are not a
            diagnosis and do not replace assessment by qualified medical professionals.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl">2. Data we process</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><b>Account data:</b> name, email, role, and a scrypt-hashed password (the plaintext password is never stored).</li>
            <li><b>Patient records:</b> demographics, contact and emergency contact, allergies, conditions, insurance details, visits, encounters, prescriptions, lab requests, and invoices.</li>
            <li><b>Confirmed symptom transcripts:</b> the text you confirm in the symptom assessment form, stored with the resulting department suggestion and urgency flag.</li>
            <li><b>Audit log entries:</b> who created or updated clinical records, recorded without passwords or tokens.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl">3. Voice input</h2>
          <p className="mt-2">
            When you use the microphone on the symptom page, speech recognition runs in your own
            browser with your explicit permission. Raw audio is never stored, and neither your words
            nor any audio are sent to external AI providers — the confirmed text is processed by this
            hospital&apos;s own server. Recognition requires a supported browser; typing is always
            available as a fallback.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl">4. Who can see your data</h2>
          <p className="mt-2">
            Access is enforced server-side by role. Patients can see only their own appointments,
            records, and invoices. Doctors and administrators can access patient records only within
            the access rules of their deployment. Session cookies are HTTP-only and role changes
            cannot be made from the browser.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl">5. What we do not do</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>We do not sell data or send it to advertising or analytics platforms.</li>
            <li>We do not place patient information in URLs, public logs, or public model-training datasets.</li>
            <li>We do not use fabricated or synthetic records as real clinical data; synthetic data is only used when explicitly labeled for testing.</li>
            <li>We do not claim regulatory compliance (HIPAA, DPDP, GDPR) unless your deployment has been independently reviewed for it.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl">6. Your choices</h2>
          <p className="mt-2">
            You can edit your own contact details and health flags in your profile, or request
            corrections to clinical records from hospital staff. Corrections are recorded as
            clinician-reviewed updates rather than silent overwrites of history. Contact the
            hospital&apos;s administrator (the operator who runs this deployment) for access,
            transfer, or deletion requests.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl">7. Emergencies</h2>
          <p className="mt-2">
            The symptom assessment can flag emergencies, but if you have symptoms that may be
            life-threatening — chest pain with breathing difficulty, stroke signs, severe bleeding,
            unconsciousness — call your local emergency number (112 in India) immediately instead of
            waiting for an assessment.
          </p>
        </section>
      </div>

      <div className="mt-12 flex gap-4 text-sm">
        <Link href="/terms" className="font-semibold text-primary underline underline-offset-2">Terms and Conditions</Link>
        <Link href="/" className="font-semibold text-primary underline underline-offset-2">Back to CarePulse</Link>
      </div>
    </main>
  );
}
