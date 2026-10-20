"use client";

import * as React from "react";
import Link from "next/link";
import {
  Mic,
  Square,
  Keyboard,
  Stethoscope,
  AlertTriangle,
  PhoneCall,
  CheckCircle2,
  RotateCcw,
  ClipboardEdit,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/misc";

/* ─────────────── types from the API ─────────────── */

interface AnalysisResult {
  id: string;
  analysis: {
    urgency: "emergency" | "urgent" | "routine";
    urgencyReason: string;
    suggestedDepartment: string;
    alternativeDepartments: string[];
    symptoms: { name: string; negated: boolean; text: string }[];
    negated: string[];
    duration?: string;
    severity?: string;
    followUpQuestions: { id: string; question: string; reason: string }[];
    explanation: string;
    version: string;
  };
  doctor: {
    id: string;
    name: string;
    specialty: string;
    department: string;
    qualification: string;
    room: string;
    experienceYears: number;
  } | null;
  disclaimer: string;
}

/* ─────────────── speech recognition hook ─────────────── */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } };
}

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  return Ctor ? new Ctor() : null;
}

/* ─────────────── main page ─────────────── */

export default function SymptomCheckPage() {
  const session = useStore((s) => s.session);
  const doctors = useStore((s) => s.doctors);
  const toast = useStore((s) => s.toast);

  const [text, setText] = React.useState("");
  const [listening, setListening] = React.useState(false);
  const [speechError, setSpeechError] = React.useState<string | null>(null);
  const [supported, setSupported] = React.useState(true);
  const [lang, setLang] = React.useState("en-US");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<AnalysisResult | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [inputMode, setInputMode] = React.useState<"text" | "voice">("text");
  const [editedAfter, setEditedAfter] = React.useState(false);
  const [listRefresh, setListRefresh] = React.useState(0);

  const recRef = React.useRef<SpeechRecognitionLike | null>(null);
  const finalRef = React.useRef(""); // accumulated final transcripts
  const baseRef = React.useRef(""); // manual text before dictation started

  React.useEffect(() => {
    const rec = getRecognition();
    setSupported(rec !== null || typeof window === "undefined" ? true : false);
    // real probe: only mark unsupported if constructor lookup fails
    const w = window as unknown as Record<string, unknown>;
    if (!(w.SpeechRecognition || w.webkitSpeechRecognition)) setSupported(false);
  }, []);

  function stopRecognition() {
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
    setListening(false);
  }

  function startRecognition() {
    setSpeechError(null);
    setResult(null);
    const rec = getRecognition();
    if (!rec) {
      setSupported(false);
      setSpeechError("Voice recognition is not available in this browser. Please type your symptoms instead.");
      return;
    }
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      if (finalRef.current || interim) {
        setInputMode("voice");
        setEditedAfter(false);
        setText((baseRef.current ? baseRef.current + " " : "") + (finalRef.current + interim).trim());
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setSpeechError("Microphone permission was denied. Allow microphone access in your browser settings, or type your symptoms below.");
      } else if (e.error === "no-speech") {
        setSpeechError("No speech detected — try again a bit closer to the microphone.");
      } else if (e.error !== "aborted") {
        setSpeechError(`Speech recognition error: ${e.error}. You can type your symptoms instead.`);
      }
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (err) {
      setSpeechError(err instanceof Error ? err.message : "Could not start the microphone.");
      setListening(false);
    }
  }

  function reset() {
    baseRef.current = "";
    finalRef.current = "";
    setText("");
    setResult(null);
    setSpeechError(null);
    setWarnings([]);
    setEditedAfter(false);
    stopRecognition();
  }

  async function submit() {
    const trimmed = text.trim();
    if (trimmed.length < 5) {
      toast({ title: "Please describe your symptoms first.", variant: "destructive" });
      return;
    }
    setBusy(true);
    setWarnings([]);
    try {
      const res = await fetch("/api/symptom-assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: trimmed, inputMode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error ?? "Could not analyze your symptoms.", variant: "destructive" });
        setBusy(false);
        return;
      }
      const data = (await res.json()) as AnalysisResult;
      setResult(data);
      setListRefresh((n) => n + 1); // refresh the previous-assessments list
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast({ title: "Network error — check your connection and try again.", variant: "destructive" });
    }
    setBusy(false);
  }

  const r = result;

  return (
    <>
      <PageHeader
        kicker="Symptom Assessment"
        title="Describe your symptoms"
        description="Type or speak your symptoms in your own words. This gives a preliminary department recommendation — it is not a diagnosis."
      />

      {/* privacy notice */}
      <Card className="mb-6 border-info/30 bg-info/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-info" />
          <p className="text-muted-foreground">
            Your description is analyzed on this hospital&apos;s own server — your words or audio are never sent
            to any external AI provider, and raw audio is never stored. Only the final text you confirm is kept
            in your medical record for your doctor to review.
          </p>
        </CardContent>
      </Card>

      {/* ══════════ result ══════════ */}
      {r && (
        <Card className="mb-8 overflow-hidden">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="size-5 text-primary" /> Assessment result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            {r.analysis.urgency === "emergency" && (
              <div className="rounded border border-destructive/40 bg-destructive/10 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-destructive" />
                  <p className="font-semibold uppercase tracking-wider text-destructive text-sm">
                    Seek emergency care now
                  </p>
                </div>
                <p className="mt-2 text-sm">{r.analysis.urgencyReason}</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-destructive">
                  <PhoneCall className="size-4" /> Call 112 (India emergency) or go to the nearest emergency department immediately.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded border bg-muted/40 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Suggested department
                </p>
                <p className="mt-1 font-serif text-xl">{r.analysis.suggestedDepartment}</p>
                <p className="mt-1 text-xs text-muted-foreground">{r.analysis.explanation}</p>
              </div>
              {r.doctor ? (
                <div className="rounded border bg-muted/40 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Suggested doctor
                  </p>
                  <p className="mt-1 font-serif text-xl">{r.doctor.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.doctor.specialty} · {r.doctor.qualification} · Room {r.doctor.room} ·{" "}
                    {r.doctor.experienceYears} yrs experience
                  </p>
                  <Link
                    href={`/patient/appointments?dept=${encodeURIComponent(r.analysis.suggestedDepartment)}`}
                    className="inline-flex h-9 items-center rounded bg-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Book an appointment
                  </Link>
                </div>
              ) : r.analysis.urgency !== "emergency" ? (
                <div className="rounded border bg-muted/40 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Suggested doctor
                  </p>
                  <p className="mt-1 text-sm">
                    No {r.analysis.suggestedDepartment} doctor is currently available in this hospital&apos;s
                    directory. Please contact the front desk for the next step.
                  </p>
                </div>
              ) : null}
            </div>

            {r.analysis.alternativeDepartments.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Also relevant: {r.analysis.alternativeDepartments.join(", ")} — the doctor will confirm the right specialty.
              </p>
            )}

            {/* symptoms & negation transparency */}
            {r.analysis.symptoms.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {r.analysis.symptoms.map((s) => (
                  <Badge key={s.name} variant={s.negated ? "outline" : "default"}>
                    {s.negated ? `not: ${s.name}` : s.name}
                  </Badge>
                ))}
              </div>
            )}

            {r.analysis.followUpQuestions.length > 0 && (
              <div className="rounded border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <ClipboardEdit className="size-4 text-amber-600" /> To refine this assessment, consider answering:
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {r.analysis.followUpQuestions.map((q) => (
                    <li key={q.id}>
                      • {q.question} <span className="text-xs opacity-70">({q.reason})</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Mention these when you speak with the doctor or edit your description above.
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{r.disclaimer}</p>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="size-4" /> New assessment
              </Button>
              <Button variant="ghost" onClick={() => setResult(null)}>
                <ClipboardEdit className="size-4" /> Edit my description
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ══════════ input form ══════════ */}
      {!r && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center justify-between">
              <span>Your description</span>
              <span className="text-xs font-normal normal-case text-muted-foreground">
                {editedAfter ? "edited by you" : inputMode === "voice" ? "from voice" : "typed"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <textarea
              className="min-h-32 w-full rounded border border-border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder='Example: "I have chest discomfort and difficulty breathing since this morning."'
              value={text}
              maxLength={2000}
              onChange={(e) => {
                setText(e.target.value);
                setInputMode(e.target.value ? inputMode : "text");
                setEditedAfter(true);
                stopRecognition();
              }}
              aria-label="Describe your symptoms"
            />

            {/* mic controls */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant={listening ? "destructive" : "outline"}
                onClick={listening ? stopRecognition : startRecognition}
                disabled={!supported}
                aria-label={listening ? "Stop recording" : "Start recording"}
              >
                {listening ? <Square className="size-4" /> : <Mic className="size-4" />}
                {listening ? "Stop" : "Speak symptoms"}
              </Button>
              {listening && (
                <span className="flex items-center gap-2 text-sm text-destructive" role="status">
                  <span className="size-2 animate-pulse rounded-full bg-destructive" /> Listening… speak now
                </span>
              )}
              <select
                className="rounded border border-border bg-card px-2 py-1.5 text-xs"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                aria-label="Speech recognition language"
              >
                <option value="en-US">English (India/US)</option>
                <option value="hi-IN">हिन्दी (Hindi)</option>
                <option value="ta-IN">தமிழ் (Tamil)</option>
                <option value="bn-IN">বাংলা (Bengali)</option>
                <option value="mr-IN">मराठी (Marathi)</option>
                <option value="te-IN">తెలుగు (Telugu)</option>
              </select>
              {!supported && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Keyboard className="size-3.5" /> Voice not supported here — typing works everywhere.
                </span>
              )}
            </div>

            {speechError && (
              <p className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning" role="alert">
                {speechError}
              </p>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {text.length}/2000 characters · edit anything you need before submitting
              </p>
              <Button onClick={submit} disabled={busy || text.trim().length < 5}>
                {busy ? "Analyzing…" : "Submit for assessment"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* past assessments from DB */}
      <PastAssessments
        patientId={session?.patientId}
        doctors={doctors.map((d) => ({ id: d.id, name: d.name }))}
        refreshKey={listRefresh}
      />
    </>
  );
}

/* ─────────────── past assessments list (real DB rows) ─────────────── */

interface AssessmentRow {
  id: string;
  suggestedDepartment: string;
  urgency: string;
  transcript: string;
  createdAt: string;
  doctorId: string | null;
}

function PastAssessments({
  patientId,
  doctors,
  refreshKey,
}: {
  patientId?: string;
  doctors: { id: string; name: string }[];
  refreshKey: number;
}) {
  const [rows, setRows] = React.useState<AssessmentRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/symptom-assessments")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to load");
        return res.json();
      })
      .then((d: { assessments: AssessmentRow[] }) => {
        if (alive) setRows(d.assessments);
      })
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (error) return null; // past-list is secondary; do not clutter on failure

  if (!rows) return null;
  if (rows.length === 0) return null;

  return (
    <Card className="mt-8">
      <CardHeader className="pb-0">
        <CardTitle className="text-base">Your previous assessments</CardTitle>
      </CardHeader>          <CardContent className="space-y-3 p-6">
            {rows.map((row) => (
          <div key={row.id} className="rounded border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={row.urgency === "emergency" ? "destructive" : row.urgency === "urgent" ? "warning" : "outline"}>
                {row.urgency}
              </Badge>
              <span className="font-semibold">{row.suggestedDepartment}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(row.createdAt).toLocaleString()}
              </span>
              {row.doctorId && (
                <span className="text-xs text-muted-foreground">
                  · suggested {doctors.find((d) => d.id === row.doctorId)?.name ?? "doctor"}
                </span>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">“{row.transcript}”</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
