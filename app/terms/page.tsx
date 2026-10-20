import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms and Conditions — CarePulse",
  description: "Terms of use for this CarePulse hospital management deployment.",
};

export default function Terms() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">CarePulse</p>
      <h1 className="mt-2 font-display text-3xl">Terms and Conditions</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Last updated: October 2026 · Applies to this CarePulse hospital management deployment.
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed">
        <section>
          <h2 className="font-display text-xl">1. Who provides this service</h2>
          <p className="mt-2">
            This deployment of CarePulse is operated by the hospital or clinic that registered the
            site (the &quot;Operator&quot;). CarePulse is the software platform; medical services,
            medical records ownership, and any clinical decisions belong to the Operator and its
            registered clinicians.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl">2. Eligibility and accounts</h2>
          <p className="mt-2">
            Patients create their own accounts with accurate details. Doctors registered on the
            platform represent themselves accurately (qualifications, license number, specialty) and
            only with the Operator&apos;s knowledge. Administrator accounts require the
            Operator&apos;s access code. You are responsible for keeping your password private; use
            of your account is presumed to be your own action.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl">3. Medical decision support — not medical advice</h2>
          <p className="mt-2">
            Features such as the symptom assessment, AI-assisted triage in the Emergency Center, and
            length-of-stay forecasting are decision-support demonstrations. They:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>provide preliminary routing suggestions only, and never a diagnosis;</li>
            <li>cannot rule out an emergency — only a qualified clinician can do that;</li>
            <li>may be incomplete or wrong, and can only be confirmed by human review;</li>
            <li>show suggestions that staff can and often will override.</li>
          </ul>
          <p className="mt-2">
            In a potentially life-threatening situation (chest pain with breathing difficulty,
            stroke signs, severe bleeding, unconsciousness), do not rely on the platform: call your
            local emergency number (112 in India) or go to the nearest emergency department.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl">4. Appointments, billing and availability</h2>
          <p className="mt-2">
            Booking requests are confirmed by the server; slots are validated against the
            doctor&apos;s real calendar at booking time. Appointment and invoice information shown in
            the platform is authoritative only when the Operator confirms it. The platform does not
            process external card payments; payment handling is managed by the Operator.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl">5. Acceptable use</h2>
          <p className="mt-2">
            Do not attempt to access other users&apos; or patients&apos; records, probe or
            overload the service, submit false clinical information, or use the platform for purposes
            that are unlawful. Protecting other accounts is enforced server-side; violation may lead
            to your account being disabled by the Operator.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl">6. Changes to the service</h2>
          <p className="mt-2">
            The Operator may change or withdraw features (for example as models retrain or data is
            reviewed). AI features may be unavailable while datasets are being validated, and the
            platform will state this rather than show invented numbers.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl">7. Liability</h2>
          <p className="mt-2">
            To the extent permitted by your jurisdiction&apos;s law,            the software platform (CarePulse) is provided without liability for clinical outcomes, which remain the
            professional responsibility of the Operator&apos;s clinicians. Nothing here limits
            liability that cannot be limited by law.
          </p>
        </section>
      </div>

      <div className="mt-12 flex gap-4 text-sm">
        <Link href="/privacy" className="font-semibold text-primary underline underline-offset-2">Privacy Policy</Link>
        <Link href="/" className="font-semibold text-primary underline underline-offset-2">Back to CarePulse</Link>
      </div>
    </main>
  );
}
