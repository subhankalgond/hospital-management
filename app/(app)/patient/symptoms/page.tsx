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
  Plus,
  X,
  Check,
  Activity,
  ArrowRight,
  ShieldAlert,
  Info,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/misc";

/* ─────────────── types from the API ─────────────── */

export interface MatchedConditionUI {
  id: string;
  name: string;
  department: string;
  urgency: "emergency" | "urgent" | "routine";
  description: string;
  matchScore: number;
  matchedSymptoms: string[];
  otherSymptoms: string[];
  nextSteps: string;
}

export interface AvailableDoctorUI {
  id: string;
  name: string;
  specialty: string;
  department: string;
  qualification: string;
  room: string;
  experienceYears: number;
  rating?: number;
}

interface AnalysisResult {
  id: string;
  analysis: {
    urgency: "emergency" | "urgent" | "routine";
    urgencyReason: string;
    suggestedDepartment: string;
    alternativeDepartments: string[];
    possibleConditions?: MatchedConditionUI[];
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
  availableDoctors?: AvailableDoctorUI[];
  disclaimer: string;
}

/* ─────────────── common quick symptom chips ─────────────── */

const COMMON_SYMPTOM_PRESETS = [
  "High fever",
  "Headache",
  "Body ache",
  "Pain behind the eyes",
  "Nausea",
  "Vomiting",
  "Skin rash",
  "Cough",
  "Difficulty breathing",
  "Joint pain",
  "Swelling",
  "Difficulty moving",
  "Chest pain",
  "Sore throat",
  "Abdominal pain",
  "Dizziness",
  "Fatigue",
];

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

  const [selectedSymptoms, setSelectedSymptoms] = React.useState<string[]>([]);
  const [customSymptomInput, setCustomSymptomInput] = React.useState("");
  const [text, setText] = React.useState("");
  const [listening, setListening] = React.useState(false);
  const [speechError, setSpeechError] = React.useState<string | null>(null);
  const [supported, setSupported] = React.useState(true);
  const [lang, setLang] = React.useState("en-US");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<AnalysisResult | null>(null);
  const [inputMode, setInputMode] = React.useState<"text" | "voice">("text");
  const [editedAfter, setEditedAfter] = React.useState(false);
  const [listRefresh, setListRefresh] = React.useState(0);

  const recRef = React.useRef<SpeechRecognitionLike | null>(null);
  const finalRef = React.useRef("");
  const baseRef = React.useRef("");

  React.useEffect(() => {
    const rec = getRecognition();
    setSupported(rec !== null || typeof window === "undefined" ? true : false);
    const w = window as unknown as Record<string, unknown>;
    if (!(w.SpeechRecognition || w.webkitSpeechRecognition)) setSupported(false);
  }, []);

  function togglePresetSymptom(symptom: string) {
    setSelectedSymptoms((prev) => {
      const exists = prev.some((s) => s.toLowerCase() === symptom.toLowerCase());
      if (exists) {
        return prev.filter((s) => s.toLowerCase() !== symptom.toLowerCase());
      } else {
        return [...prev, symptom];
      }
    });
  }

  function addCustomSymptom() {
    const trimmed = customSymptomInput.trim();
    if (!trimmed) return;
    const exists = selectedSymptoms.some((s) => s.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      toast({ title: `"${trimmed}" is already added.`, variant: "destructive" });
      setCustomSymptomInput("");
      return;
    }
    setSelectedSymptoms((prev) => [...prev, trimmed]);
    setCustomSymptomInput("");
  }

  function removeSymptom(symptom: string) {
    setSelectedSymptoms((prev) => prev.filter((s) => s !== symptom));
  }

  function clearAllSymptoms() {
    setSelectedSymptoms([]);
  }

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
      setSpeechError("Voice recognition is not available in this browser. Please type or select your symptoms instead.");
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
        setSpeechError("Microphone permission was denied. Allow microphone access in your browser settings, or select symptoms below.");
      } else if (e.error === "no-speech") {
        setSpeechError("No speech detected — try again closer to the microphone.");
      } else if (e.error !== "aborted") {
        setSpeechError(`Speech recognition error: ${e.error}. You can type or select symptoms instead.`);
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
    setSelectedSymptoms([]);
    setCustomSymptomInput("");
    setResult(null);
    setSpeechError(null);
    setEditedAfter(false);
    stopRecognition();
  }

  async function submit() {
    const trimmedText = text.trim();
    if (selectedSymptoms.length === 0 && trimmedText.length < 3) {
      toast({
        title: "Please select or describe at least one symptom to evaluate.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/symptom-assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: trimmedText,
          symptoms: selectedSymptoms,
          inputMode,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error ?? "Could not analyze your symptoms.", variant: "destructive" });
        setBusy(false);
        return;
      }
      const data = (await res.json()) as AnalysisResult;
      setResult(data);
      setListRefresh((n) => n + 1);
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
        title="Multi-Symptom Diagnostic Checker"
        description="Select or describe your combination of symptoms to receive AI-assisted clinical decision support, possible conditions, and recommended specialists."
      />

      {/* privacy notice */}
      <Card className="mb-6 border-info/30 bg-info/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-info" />
          <p className="text-muted-foreground">
            Your health symptoms are evaluated on this hospital&apos;s secure server — your data is never sent to external third-party advertisers. All assessments provide clinical decision support and do not replace an in-person medical diagnosis.
          </p>
        </CardContent>
      </Card>

      {/* ══════════ RESULTS VIEW ══════════ */}
      {r && (
        <div className="mb-8 space-y-6">
          {/* Emergency Alert Banner */}
          {r.analysis.urgency === "emergency" && (
            <Card className="border-2 border-destructive bg-destructive/10 shadow-lg">
              <CardContent className="space-y-3 p-6">
                <div className="flex items-center gap-3 text-destructive">
                  <AlertTriangle className="size-6 shrink-0 animate-bounce" />
                  <h3 className="text-lg font-bold uppercase tracking-wider">
                    Emergency Warning: Immediate Care Required
                  </h3>
                </div>
                <p className="text-sm font-medium text-foreground">
                  {r.analysis.urgencyReason}
                </p>
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <a
                    href="tel:112"
                    className="inline-flex items-center gap-2 rounded bg-destructive px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-destructive-foreground shadow hover:bg-destructive/90 transition-colors"
                  >
                    <PhoneCall className="size-4" /> Call 112 (Emergency)
                  </a>
                  <p className="text-xs font-semibold text-destructive">
                    Do not wait for an appointment. Proceed immediately to the nearest Emergency Center.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Possible Conditions & Differential Analysis */}
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="size-5 text-primary" />
                  <span>Possible Conditions & Clinical Analysis</span>
                </div>
                <Badge
                  variant={
                    r.analysis.urgency === "emergency"
                      ? "destructive"
                      : r.analysis.urgency === "urgent"
                        ? "warning"
                        : "outline"
                  }
                  className="uppercase tracking-wider text-[11px]"
                >
                  Urgency: {r.analysis.urgency}
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Clinical correlation based on your reported combination of symptoms. Preliminary analysis for guidance only.
              </p>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              {r.analysis.possibleConditions && r.analysis.possibleConditions.length > 0 ? (
                <div className="space-y-4">
                  {r.analysis.possibleConditions.map((cond) => (
                    <div
                      key={cond.id}
                      className="rounded-lg border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-serif text-lg font-bold text-foreground">
                            {cond.name}
                          </h4>
                          <Badge
                            variant="default"
                            className="bg-primary/90 text-primary-foreground font-mono text-xs"
                          >
                            {cond.matchScore}% Match
                          </Badge>
                          <Badge
                            variant={
                              cond.urgency === "emergency"
                                ? "destructive"
                                : cond.urgency === "urgent"
                                  ? "warning"
                                  : "outline"
                            }
                            className="text-[11px] uppercase"
                          >
                            {cond.urgency}
                          </Badge>
                        </div>
                        <Badge variant="secondary" className="text-xs font-semibold">
                          Specialty: {cond.department}
                        </Badge>
                      </div>

                      <p className="text-sm text-foreground/90 leading-relaxed">
                        {cond.description}
                      </p>

                      {/* Matching symptoms */}
                      {cond.matchedSymptoms.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Symptoms matching your input:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {cond.matchedSymptoms.map((sym) => (
                              <Badge
                                key={sym}
                                className="bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1 text-xs py-0.5"
                              >
                                <Check className="size-3" /> {sym}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Other associated symptoms */}
                      {cond.otherSymptoms.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Other commonly associated symptoms:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {cond.otherSymptoms.map((sym) => (
                              <Badge
                                key={sym}
                                variant="outline"
                                className="text-xs text-muted-foreground"
                              >
                                {sym}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recommended next steps */}
                      <div className="rounded border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed mt-2">
                        <span className="font-semibold text-primary">Recommended Next Steps: </span>
                        <span className="text-foreground/90">{cond.nextSteps}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <Info className="size-4 text-info" />
                    <span>No specific condition pattern matched</span>
                  </div>
                  <p>
                    The combination of symptoms entered did not match a specific disease pattern in our clinical database. Many symptoms are non-specific and overlap across multiple medical areas.
                  </p>
                  <p>
                    We recommend consulting a General Physician for an in-person physical examination and diagnostic evaluation.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recommended Department & Doctor */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recommended Department
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-serif text-2xl font-bold text-foreground">
                  {r.analysis.suggestedDepartment}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {r.analysis.explanation}
                </p>
                {r.analysis.alternativeDepartments.length > 0 && (
                  <p className="text-xs text-muted-foreground pt-1">
                    <span className="font-semibold">Alternative specialties to consider:</span>{" "}
                    {r.analysis.alternativeDepartments.join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recommended Clinician
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {r.doctor ? (
                  <>
                    <div>
                      <p className="font-serif text-xl font-bold text-foreground">
                        {r.doctor.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.doctor.specialty} · {r.doctor.qualification} · Room {r.doctor.room} ·{" "}
                        {r.doctor.experienceYears} yrs experience
                      </p>
                    </div>
                    {r.analysis.urgency !== "emergency" ? (
                      <Link
                        href={`/patient/appointments?dept=${encodeURIComponent(
                          r.analysis.suggestedDepartment
                        )}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded bg-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Book an appointment <ArrowRight className="size-3.5" />
                      </Link>
                    ) : (
                      <p className="text-xs text-destructive font-semibold">
                        Emergency condition: Please proceed directly to the Emergency Center.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No specialist is currently listed for {r.analysis.suggestedDepartment} in this facility. Please contact the front desk or consult General Medicine.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Other available doctors in this department */}
          {r.availableDoctors && r.availableDoctors.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Other available clinicians in {r.analysis.suggestedDepartment}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {r.availableDoctors
                    .filter((d) => d.id !== r.doctor?.id)
                    .map((doc) => (
                      <div
                        key={doc.id}
                        className="rounded border border-border p-3 space-y-1 text-sm bg-muted/10"
                      >
                        <p className="font-semibold text-foreground">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.specialty} · {doc.experienceYears} yrs exp · Room {doc.room}
                        </p>
                        <Link
                          href={`/patient/appointments?dept=${encodeURIComponent(
                            doc.department
                          )}`}
                          className="inline-block text-xs font-semibold text-primary hover:underline pt-1"
                        >
                          Book appointment →
                        </Link>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Extracted Symptoms & Follow-Up Prompts */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Symptom Extraction & Clinical Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {r.analysis.symptoms.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Recognized symptoms:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {r.analysis.symptoms.map((s) => (
                      <Badge
                        key={s.name}
                        variant={s.negated ? "outline" : "default"}
                        className={s.negated ? "line-through opacity-75" : ""}
                      >
                        {s.negated ? `Negated: ${s.name}` : s.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {r.analysis.followUpQuestions.length > 0 && (
                <div className="rounded border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                    <ClipboardEdit className="size-4" /> Recommended clinical points to discuss with your doctor:
                  </p>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {r.analysis.followUpQuestions.map((q) => (
                      <li key={q.id}>
                        • <span className="font-medium text-foreground">{q.question}</span>{" "}
                        <span className="opacity-70">({q.reason})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Medical Disclaimer */}
              <div className="rounded border border-border bg-muted/40 p-3 text-xs text-muted-foreground flex items-start gap-2">
                <ShieldAlert className="size-4 shrink-0 mt-0.5 text-primary" />
                <span>{r.disclaimer}</span>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="outline" onClick={reset}>
                  <RotateCcw className="size-4" /> Start new assessment
                </Button>
                <Button variant="ghost" onClick={() => setResult(null)}>
                  <ClipboardEdit className="size-4" /> Modify symptoms & re-check
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════ INPUT FORM ══════════ */}
      {!r && (
        <div className="space-y-6">
          {/* Quick Multi-Symptom Selector Chips */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Select Symptoms (Multiple)</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {selectedSymptoms.length} selected
                </span>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Click common symptoms to quickly add them, or type additional symptoms below.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {COMMON_SYMPTOM_PRESETS.map((preset) => {
                  const isSelected = selectedSymptoms.some(
                    (s) => s.toLowerCase() === preset.toLowerCase()
                  );
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => togglePresetSymptom(preset)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary ring-offset-1"
                          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground border border-border"
                      }`}
                    >
                      {isSelected ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                      {preset}
                    </button>
                  );
                })}
              </div>

              {/* Custom symptom input */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="text"
                  className="h-9 flex-1 rounded border border-border bg-card px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder='Add any other symptom (e.g. "pain behind the eyes", "vomiting", "stiff neck")'
                  value={customSymptomInput}
                  onChange={(e) => setCustomSymptomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomSymptom();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCustomSymptom}
                  disabled={!customSymptomInput.trim()}
                >
                  <Plus className="size-3.5" /> Add
                </Button>
              </div>

              {/* Selected symptoms badge tray */}
              {selectedSymptoms.length > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-primary">
                    <span>Selected Symptoms ({selectedSymptoms.length}):</span>
                    <button
                      type="button"
                      onClick={clearAllSymptoms}
                      className="text-xs text-muted-foreground hover:text-destructive underline"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSymptoms.map((sym) => (
                      <span
                        key={sym}
                        className="inline-flex items-center gap-1 rounded bg-card border border-primary/30 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm"
                      >
                        {sym}
                        <button
                          type="button"
                          onClick={() => removeSymptom(sym)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${sym}`}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Narrative / Voice input */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>Additional Details or Voice Description (Optional)</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {editedAfter ? "edited by you" : inputMode === "voice" ? "from voice" : "typed"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                className="min-h-24 w-full rounded border border-border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                placeholder='Optionally describe duration, severity, or additional details (e.g. "I also have severe nausea and high fever for 3 days without cough")'
                value={text}
                maxLength={2000}
                onChange={(e) => {
                  setText(e.target.value);
                  setInputMode(e.target.value ? inputMode : "text");
                  setEditedAfter(true);
                  stopRecognition();
                }}
                aria-label="Additional symptom details"
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
                    <Keyboard className="size-3.5" /> Voice not supported here — typing & chips work everywhere.
                  </span>
                )}
              </div>

              {speechError && (
                <p className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning" role="alert">
                  {speechError}
                </p>
              )}

              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  {selectedSymptoms.length > 0
                    ? `${selectedSymptoms.length} symptom(s) selected`
                    : "Select chips or type description"}
                </p>
                <Button
                  onClick={submit}
                  disabled={busy || (selectedSymptoms.length === 0 && text.trim().length < 3)}
                  className="font-semibold"
                >
                  {busy ? "Analyzing symptoms…" : "Analyze Symptoms"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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

  if (error) return null;
  if (!rows || rows.length === 0) return null;

  return (
    <Card className="mt-8">
      <CardHeader className="pb-0">
        <CardTitle className="text-base">Your previous assessments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-6">
        {rows.map((row) => (
          <div key={row.id} className="rounded border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  row.urgency === "emergency"
                    ? "destructive"
                    : row.urgency === "urgent"
                      ? "warning"
                      : "outline"
                }
              >
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
