"use client";

import * as React from "react";
import { CalendarPlus, CalendarOff, Clock, MapPin, Search, Stethoscope, GraduationCap, ArrowRight, Sparkles, Loader2, PhoneCall, AlertTriangle, TicketCheck } from "lucide-react";
import { useStore, type Slot } from "@/lib/store";
import type { Appointment, Doctor, QueuePosition } from "@/lib/types";
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Badge,
  Input,
  Label,
  Textarea,
} from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/overlays";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, ApptStatus } from "@/components/ui/misc";
import { dayLabel, dateLabel } from "@/lib/utils";
import { DEPARTMENT_NAMES } from "@/lib/defaults";

const REASONS = [
  "General consultation",
  "Follow-up visit",
  "New symptom",
  "Prescription refill",
  "Second opinion",
  "Lab results review",
];

/**
 * Loads the Razorpay checkout bridge on demand and resolves the verified
 * handler payload (order_id | payment_id | signature) or null on cancel.
 * No card data ever touches this app — the gateway frame collects it.
 */
async function openRazorpayCheckout(opts: { keyId: string; orderId: string; amount: number; currency: string }): Promise<{ order_id: string; payment_id: string; signature: string } | null> {
  if (typeof window === "undefined" || opts.currency !== "INR") return null;
  if (!(window as any).Razorpay) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("checkout-load-failed"));
      document.head.appendChild(s);
      setTimeout(() => reject(new Error("checkout-load-timeout")), 10_000);
    }).catch(() => null);
  }
  const RazorpayCtor = (window as any).Razorpay;
  if (!RazorpayCtor) return null;
  return new Promise((resolve) => {
    const rzp = new RazorpayCtor({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amount,
      currency: opts.currency,
      name: "Hospital consultation fee",
      theme_color: "#0f766e",
      handler: (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
        resolve({ order_id: resp.razorpay_order_id, payment_id: resp.razorpay_payment_id, signature: resp.razorpay_signature }),
      modal: { ondismiss: () => resolve(null), escape: false },
    });
    rzp.on?.("payment.failed", () => resolve(null));
    rzp.open();
  });
}

export default function PatientAppointments() {
  const session = useStore((s) => s.session)!;
  const doctors = useStore((s) => s.doctors);
  const appointments = useStore((s) => s.appointments);
  const book = useStore((s) => s.bookAppointment);
  const cancel = useStore((s) => s.cancelAppointment);
  const slotsFor = useStore((s) => s.slotsFor);
  const isDoctorOnLeave = useStore((s) => s.isDoctorOnLeave);
  const nextFreeSlot = useStore((s) => s.nextFreeSlot);
  const leaves = useStore((s) => s.leaves);

  const today = new Date().toISOString().slice(0, 10);
  const mine = appointments.filter((a) => a.patientId === session.patientId);
  const upcoming = mine
    .filter((a) => a.date >= today && a.status !== "cancelled" && a.status !== "completed")
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const past = mine
    .filter((a) => !(a.date >= today && a.status !== "cancelled" && a.status !== "completed"))
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  // booking form state
  const [open, setOpen] = React.useState(false);
  const [doctorId, setDoctorId] = React.useState("");
  const [date, setDate] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [reason, setReason] = React.useState("");
  const [slot, setSlot] = React.useState<string | null>(null);
  const [booking, setBooking] = React.useState(false);

  // doctor browser filters
  const [deptFilter, setDeptFilter] = React.useState("all");
  const [q, setQ] = React.useState("");

  const visibleDoctors = doctors
    .filter((d) => (deptFilter === "all" ? true : d.department === deptFilter))
    .filter((d) => `${d.name} ${d.specialty} ${d.department}`.toLowerCase().includes(q.toLowerCase()));

  const slots = React.useMemo(
    () => (doctorId && date ? slotsFor(doctorId, date) : []),
    [doctorId, date, appointments, leaves] // recompute only on data change
  );
  const canBook = doctorId && reason.trim() && slot;

  // "Next free" chips: expensive (scans 14 days × 18 slots per doctor), so
  // compute them once per doctors/leaves change, not on every keystroke.
  const nextFreeByDoctor = React.useMemo(() => {
    const map = new Map<string, { date: string; time: string }>();
    for (const d of doctors) {
      const nf = nextFreeSlot(d.id);
      if (nf) map.set(d.id, nf);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctors, leaves, appointments]);

  // ── Care Continuity Switch ──
  // When the chosen doctor is on leave for the picked date, offer the nearest
  // available colleagues in the same department with their earliest free slot.
  const selectedDoctor = doctors.find((d) => d.id === doctorId);
  const selectedOnLeave = Boolean(doctorId && date && isDoctorOnLeave(doctorId, date));
  const alternatives = React.useMemo(() => {
    if (!selectedOnLeave || !selectedDoctor || !date) return [];
    return doctors
      .filter((d) => d.id !== doctorId && d.department === selectedDoctor.department)
      .filter((d) => !isDoctorOnLeave(d.id, date))
      .map((d) => ({ doctor: d, free: nextFreeByDoctor.get(d.id) }))
      .filter((x): x is { doctor: (typeof doctors)[number]; free: { date: string; time: string } } => x.free !== undefined)
      .sort((a, b) => (a.free.date + a.free.time).localeCompare(b.free.date + b.free.time))
      .slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOnLeave, selectedDoctor?.id, date, doctorId, doctors, nextFreeByDoctor]);

  React.useEffect(() => setSlot(null), [doctorId, date]);

  // ── AI symptom router (NLP): suggest the right department ──
  const [aiOpen, setAiOpen] = React.useState(false);
  const [aiText, setAiText] = React.useState("");
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiHint, setAiHint] = React.useState<
    | { department: string; confidence: number; isEmergency: boolean; matchedTerms: string[] }
    | null
  >(null);

  async function runAiHint() {
    if (!aiText.trim()) return;
    setAiBusy(true);
    try {
      const res = await fetch("/api/nlp/symptoms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiHint({
          department: data.department,
          confidence: data.confidence,
          isEmergency: data.urgency?.isEmergency ?? false,
          matchedTerms: data.urgency?.matchedTerms ?? [],
        });
      }
    } finally {
      setAiBusy(false);
    }
  }

  async function screenSymptoms(text: string): Promise<{ escalate: boolean; hits: any[] } | null> {
    try {
      const res = await fetch("/api/triage/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return { escalate: !!data.escalate, hits: data.hits ?? [] };
    } catch {
      return null;
    }
  }

  async function submit() {
    if (!canBook || booking) return;
    setBooking(true);
    try {
      // ── Emergency gate: screens BEFORE any booking step, so emergency
      // instructions are never delayed by the AI router or a model call. ──
      const screening = await screenSymptoms(`${reason}\n${aiText || ""}`);
      if (screening?.escalate) {
        setEmergencyHits(screening.hits);
        setEmergencyReason(reason.trim());
        setEmergencyOpen(true);
        setAwaitingAck(true); // booking pauses; the patient acks or proceeds below
        return;
      }
      await initiatePaymentAndFinish();
    } finally {
      setBooking(false);
    }
  }

  /** Booking continuation after the emergency gate is cleared. */
  async function finishBooking(paidPaymentId?: string): Promise<boolean> {
    try {
      const created = await book({
        patientId: session.patientId!,
        doctorId,
        date,
        time: slot!,
        reason: reason.trim(),
        paidPaymentId,
      });
      if (created) {
        setOpen(false);
        setDoctorId("");
        setReason("");
        setSlot(null);
        setQ("");
        setDeptFilter("all");
        setAwaitingAck(false);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ── Payment flow (server-configured; disabled when credentials absent) ──
  async function initiatePaymentAndFinish(): Promise<void> {
    if (booking) return;
    setBooking(true);
    setPayStatus("checking");
    try {
      const cfgRes = await fetch("/api/payments", { cache: "no-store" });
      const cfg = await cfgRes.json();
      if (!cfg.enabled || cfg.policy !== "required") {
        // Nothing configured / payments not mandatory → book as before.
        await finishBooking();
        return;
      }
      setPayStatus("creating");
      const orderRes = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const order = await orderRes.json();
      if (!orderRes.ok || !order.ok) {
        setPayStatus("failed");
        setPayError(order.error ?? "Payment order failed.");
        return;
      }
      setPayStatus("open");
      const ok = await openRazorpayCheckout({
        keyId: order.checkout.keyId,
        orderId: order.checkout.orderId,
        amount: order.checkout.amount,
        currency: order.checkout.currency,
      });
      if (!ok) {
        setPayStatus("failed");
        setPayError("Payment window cancelled. Your appointment was NOT booked; you can retry.");
        return;
      }
      setPayStatus("verifying");
      const verifyRes = await fetch("/api/payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ok.order_id, paymentId: ok.payment_id, signature: ok.signature }),
      });
      if (!verifyRes.ok) {
        setPayStatus("failed");
        setPayError("Signature verification failed — the appointment was NOT booked.");
        return;
      }
      await finishBooking(order.paymentId);
      setPayStatus("done");
    } finally {
      setBooking(false);
    }
  }

  type PayStatus = "idle" | "checking" | "creating" | "open" | "verifying" | "done" | "failed";
  const [payStatus, setPayStatus] = React.useState<PayStatus>("idle");
  const [payError, setPayError] = React.useState<string | null>(null);

  // ── Emergency override state ──
  const [emergencyOpen, setEmergencyOpen] = React.useState(false);
  const [emergencyHits, setEmergencyHits] = React.useState<any[]>([]);
  const [emergencyReason, setEmergencyReason] = React.useState("");
  const [awaitingAck, setAwaitingAck] = React.useState(false);

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Book, reschedule or review your visits."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="gradient">
                <CalendarPlus /> Book appointment
              </Button>
            </DialogTrigger>
            <DialogContent
              title="Book an appointment"
              description="Choose from doctors registered on CarePulse."
              className="max-w-xl"
            >
              {doctors.length === 0 ? (
                <div className="py-4">
                  <EmptyState
                    emoji="🩺"
                    title="No doctors have signed up yet"
                    description="As soon as a doctor registers, they'll appear here and you can book them."
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* doctor browser */}
                  <div className="space-y-2">
                    <Label>Doctor *</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          placeholder="Search name or specialty…"
                          className="pl-9"
                          aria-label="Search doctors"
                        />
                      </div>
                      <Select value={deptFilter} onValueChange={setDeptFilter}>
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All departments</SelectItem>
                          {DEPARTMENT_NAMES.map((d) => (
                            <SelectItem key={d} value={d}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="max-h-52 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                      {visibleDoctors.length === 0 && (
                        <p className="rounded-lg bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">
                          No doctors match your search.
                        </p>
                      )}
                      {visibleDoctors.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setDoctorId(d.id)}
                          className={
                            "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all " +
                            (doctorId === d.id
                              ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                              : "bg-card hover:border-primary/40 hover:bg-accent/50")
                          }
                        >
                          <span className="rounded-lg bg-primary/10 p-2 text-primary">
                            <Stethoscope className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-semibold">{d.name}</span>
                              {d.onCall && <Badge variant="success">On call</Badge>}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {d.specialty} · {d.department} · {d.experienceYears}y
                            </span>
                          </span>
                          {!isDoctorOnLeave(d.id, date) &&
                            (() => {
                              const nf = nextFreeByDoctor.get(d.id);
                              return nf ? (
                                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                                  Next free: {dayLabel(nf.date).replace(",", "")} {nf.time}
                                </span>
                              ) : null;
                            })()}
                        </button>
                      ))}
                    </div>
                    {doctorId && (
                      <p className="text-xs text-muted-foreground">
                        Selected: <span className="font-medium text-foreground">{doctors.find((d) => d.id === doctorId)?.name}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="appt-date">Date</Label>
                    <Input
                      id="appt-date"
                      type="date"
                      value={date}
                      min={today}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>

                  {selectedOnLeave && selectedDoctor && (
                    <div className="rounded-xl border border-warning/40 bg-warning/10 p-3">
                      <p className="flex items-center gap-2 text-sm font-medium text-warning">
                        <CalendarOff className="size-4 shrink-0" />
                        {selectedDoctor.name} is on leave on {dateLabel(date)}.
                      </p>
                      {alternatives.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-xs text-muted-foreground">
                            Care continuity — nearest available in {selectedDoctor.department}:
                          </p>
                          {alternatives.map(({ doctor, free }) => (
                            <button
                              key={doctor.id}
                              type="button"
                              onClick={() => {
                                setDoctorId(doctor.id);
                                setDate(free.date);
                                setSlot(free.time);
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-all hover:border-primary hover:bg-accent/50"
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{doctor.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {doctor.specialty} · free {dayLabel(free.date)} at {free.time}
                                </span>
                              </span>
                              <ArrowRight className="size-4 shrink-0 text-primary" />
                            </button>
                          ))}
                        </div>
                      )}
                      {alternatives.length === 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          No other {selectedDoctor.department} doctor is available within 14 days — try another date or department.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>Available slots</Label>
                    {doctorId ? (
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                        {slots.map((s: Slot) => (
                          <button
                            key={s.time}
                            disabled={!s.available}
                            onClick={() => setSlot(s.time)}
                            className={
                              "rounded-lg border px-2 py-2 text-xs font-medium tabular-nums transition-all " +
                              (slot === s.time
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : s.available
                                  ? "bg-card hover:border-primary hover:bg-accent"
                                  : "cursor-not-allowed bg-muted text-muted-foreground/50 line-through")
                            }
                          >
                            {s.time}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">
                        Select a doctor to see open slots
                      </p>
                    )}
                    {doctorId && selectedOnLeave && (
                      <p className="rounded-lg bg-warning/10 px-3 py-2 text-center text-xs font-medium text-warning">
                        All slots blocked — this doctor is on leave on {dateLabel(date)}.
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-dashed p-3">
                    <button
                      type="button"
                      onClick={() => setAiOpen((v) => !v)}
                      className="flex w-full items-center justify-between text-sm font-medium"
                    >
                      <span className="flex items-center gap-2">
                        <Sparkles className="size-4 text-primary" /> Not sure which department? Ask the AI router
                      </span>
                      <span className="text-xs text-muted-foreground">{aiOpen ? "hide" : "open"}</span>
                    </button>
                    {aiOpen && (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          rows={2}
                          value={aiText}
                          onChange={(e) => setAiText(e.target.value)}
                          placeholder="Describe your symptoms, e.g. chest tightness while walking…"
                        />
                        <Button type="button" size="sm" variant="secondary" disabled={aiBusy || !aiText.trim()} onClick={runAiHint}>
                          {aiBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                          Suggest department
                        </Button>
                        {aiHint && (
                          <div className="space-y-1.5">
                            {aiHint.isEmergency ? (
                              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                                These symptoms can be an emergency ({aiHint.matchedTerms.join(", ")}). Please go to the Emergency Center instead of booking.
                              </p>
                            ) : (
                              <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                                AI suggests <b>{aiHint.department}</b> ({Math.round(aiHint.confidence * 100)}% confidence).{" "}
                                <button
                                  type="button"
                                  className="font-semibold text-primary underline underline-offset-2"
                                  onClick={() => setDeptFilter(aiHint.department)}
                                >
                                  Show {aiHint.department} doctors
                                </button>
                              </p>
                            )}
                            <p className="text-[11px] text-muted-foreground">Decision support only — not a diagnosis.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="appt-reason">Reason for visit</Label>
                    <Input
                      id="appt-reason"
                      placeholder="e.g. chest discomfort during exercise"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setReason(r)}
                          className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/70"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button variant="gradient" className="w-full" size="lg" disabled={!canBook || booking} onClick={submit}>
                    {booking ? "Booking…" : "Confirm booking"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">History ({past.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-3">
          {upcoming.length === 0 && (
            <EmptyState
              emoji="📅"
              title="Nothing booked yet"
              description="Your upcoming appointments will show up here."
              action={<Button onClick={() => setOpen(true)}>Book appointment</Button>}
            />
          )}
          {upcoming.map((a) => (
            <div key={a.id} className="space-y-2">
              <AppointmentCard appt={a} onCancel={() => cancel(a.id)} />
              {a.status === "confirmed" && a.date === today && (
                <QueueTokenPanel appt={a} doctorName={doctors.find((d) => d.id === a.doctorId)?.name ?? "Doctor"} />
              )}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="past" className="space-y-3">
          {past.length === 0 && <EmptyState emoji="🗂" title="No past appointments" />}
          {past.map((a) => (
            <AppointmentCard key={a.id} appt={a} />
          ))}
        </TabsContent>
      </Tabs>

      {/* ── Emergency override screen (interrupts routine booking) ── */}
      <Dialog open={emergencyOpen} onOpenChange={(o) => { setEmergencyOpen(o); if (!o) setAwaitingAck(false); }}>
        <DialogContent title="Emergency warning — act now" description="Automated safety screening flagged your symptoms." className="max-w-lg">
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-destructive/60 bg-destructive/10 p-4">
              <p className="flex items-center gap-2 text-lg font-bold text-destructive">
                <AlertTriangle className="size-5" /> Seek immediate emergency medical care
              </p>
              <p className="mt-2 text-sm">
                Do NOT wait for a routine appointment. Your reported symptoms (
                "{emergencyReason}") can signal a life-threatening emergency.
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {emergencyHits.slice(0, 3).map((h, i) => (
                  <li key={i}>
                    {h.clinicalSummary?.en ?? "Careful clinical review is required."} <span className="font-mono text-[10px] opacity-60">({h.ruleId})</span>
                  </li>
                ))}
              </ul>
            </div>
            <a
              href="tel:108"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-4 text-lg font-bold text-white shadow-sm transition-transform hover:scale-[1.01]"
            >
              <PhoneCall className="size-5" /> Call 108 — National Ambulance Service
            </a>
            <p className="text-xs text-muted-foreground">
              Calling opens your phone dialer. This website does NOT dispatch an ambulance — no dispatch service is connected.
              Emergency screening is automated and does NOT replace an assessment by clinical staff.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="flex-1" onClick={() => { setEmergencyOpen(false); setAwaitingAck(false); }}>
                I will seek emergency care (recommended)
              </Button>
              <Button
                variant="ghost"
                className="flex-1 text-muted-foreground"
                onClick={() => {
                  setEmergencyOpen(false);
                  setAwaitingAck(false);
                  void initiatePaymentAndFinish();
                }}
              >
                Proceed with booking anyway
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AppointmentCard({ appt, onCancel }: { appt: Appointment; onCancel?: () => void }) {
  const doctors = useStore((s) => s.doctors);
  const reschedule = useStore((s) => s.rescheduleAppointment);
  const [reschedOpen, setReschedOpen] = React.useState(false);
  const [reschedBusy, setReschedBusy] = React.useState(false);
  const [date, setDate] = React.useState(appt.date);
  const [time, setTime] = React.useState(appt.time);
  const doc = doctors.find((d) => d.id === appt.doctorId);
  const isActive = appt.status !== "cancelled" && appt.status !== "completed";

  return (
    <Card className="p-5 transition-all hover:shadow-lift">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex flex-col items-center rounded-xl bg-primary/10 px-3 py-2 text-primary">
            <Stethoscope className="size-5" />
            <span className="mt-1 text-[11px] font-semibold">{doc?.department}</span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold">{doc?.name ?? "Doctor no longer listed"}</p>
            <p className="text-sm text-muted-foreground">
              {appt.reason}
              {doc?.room && doc.room !== "—" ? ` · Room ${doc.room}` : ""}
            </p>
            {doc && (
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <GraduationCap className="size-3.5" /> {doc.qualification} · {doc.experienceYears}y experience
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" /> {dateLabel(appt.date)} · {appt.time}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" /> {dayLabel(appt.date)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ApptStatus status={appt.status} />
          {isActive && onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {isActive && (
            <Dialog open={reschedOpen} onOpenChange={setReschedOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" size="sm">
                  Reschedule
                </Button>
              </DialogTrigger>
              <DialogContent title="Reschedule appointment" description={`With ${doc?.name ?? "doctor"}`}>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="rs-date">New date</Label>
                    <Input id="rs-date" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rs-time">New time</Label>
                    <Select value={time} onValueChange={setTime}>
                      <SelectTrigger id="rs-time">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(doc ? useStore.getState().slotsFor(doc.id, date) : []).map((s) => (
                          <SelectItem key={s.time} value={s.time} disabled={!s.available && s.time !== appt.time}>
                            {s.time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="gradient"
                    className="w-full"
                    disabled={reschedBusy}
                    onClick={async () => {
                      setReschedBusy(true);
                      try {
                        // only close the dialog when the server confirms
                        const ok = await reschedule(appt.id, date, time);
                        if (ok) setReschedOpen(false);
                      } finally {
                        setReschedBusy(false);
                      }
                    }}
                  >
                    {reschedBusy ? "Rescheduling…" : "Confirm new time"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Live OPD token panel for one of today's confirmed appointments: displays the
 * patient's token, queue position and the currently called token. Polls every
 * 15 s; estimates are deliberately NOT invented — position only.
 */
function QueueTokenPanel({ appt, doctorName }: { appt: Appointment; doctorName: string }) {
  const position = useStore((s) => s.queuePosition);
  const refreshQueuePosition = useStore((s) => s.refreshQueuePosition);
  const joinQueue = useStore((s) => s.joinQueue);
  const [joining, setJoining] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    void refreshQueuePosition();
    const iv = setInterval(() => void refreshQueuePosition(), 15_000);
    return () => clearInterval(iv);
  }, [refreshQueuePosition]);

  const mine = position && position.entry.appointmentId === appt.id ? position : null;

  if (mine && mine.entry.status === "called") {
    return (
      <Card className="border-primary bg-primary/5 p-4">
        <p className="text-sm font-semibold text-primary">It's your turn — the doctor is ready for you.</p>
        <p className="text-xs text-muted-foreground">Token #{mine.entry.tokenNo} · {doctorName}</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      {mine ? (
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Your token</p>
            <p className="text-3xl font-bold tabular-nums">{mine.entry.tokenNo}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              {mine.ahead === 0 ? (
                <span className="font-semibold text-primary">Your turn is approaching — please stay near the consultation room.</span>
              ) : (
                <>You are <b>#{mine.ahead + 1}</b> in line — {mine.ahead} patient{mine.ahead === 1 ? "" : "s"} ahead of you.</>
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {doctorName} · {mine.department}
            </p>
            {mine.currentCalled && (
              <p className="mt-1 text-xs">Current token being served: <b className="tabular-nums">#{mine.currentCalled.tokenNo}</b></p>
            )}
            <p className="mt-1 text-[10px] text-muted-foreground">Updates live every 15 s. Waiting time depends on how long each consultation takes — no fixed estimate is shown.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">You do not hold a queue token for this doctor today yet.</p>
          <Button
            size="sm"
            disabled={joining}
            onClick={async () => {
              setJoining(true);
              setErr(null);
              const r = await joinQueue(appt.id);
              if (!r.ok) setErr(r.error ?? "Could not issue a token.");
              setJoining(false);
            }}
          >
            {joining ? "Issuing…" : <><TicketCheck /> Get my token</>}
          </Button>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
      )}
    </Card>
  );
}
