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
  BookOpen,
  Sparkles,
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
  icd11Code?: string;
  category?: string;
  department: string;
  specialty?: string;
  urgency: "emergency" | "urgent" | "routine";
  description: string;
  matchScore: number;
  matchedSymptoms: string[];
  otherSymptoms: string[];
  missingClassicSymptoms?: string[];
  cancerWarningSigns?: string[];
  nextSteps: string;
  cancerSafetyDisclaimer?: string;
  requiresBiopsyOrImaging?: boolean;
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
    cancerWarningsDetected?: { symptomId: string; warningName: string; advice: string }[];
    symptoms: { name: string; negated: boolean; text: string }[];
    negated: string[];
    duration?: string;
    severity?: string;
    followUpQuestions: { id: string; question: string; reason: string }[];
    explanation: string;
    kbMetadata?: {
      totalDiseases: number;
      totalSymptoms: number;
      icd11Standard: string;
      version: string;
    };
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

/* ─────────────── grouped quick symptom presets ─────────────── */

const SYMPTOM_PRESET_CATEGORIES: { name: string; symptoms: string[] }[] = [
  {
    name: "General & Constitutional",
    symptoms: [
      "High fever",
      "Chills and shivering",
      "Night sweats",
      "Weight loss without trying",
      "Extreme tiredness or exhaustion",
      "Unexplained lump or mass",
    ],
  },
  {
    name: "Head, Neck & Neurological",
    symptoms: [
      "Headache",
      "Pain behind the eyes",
      "Dizziness or lightheadedness",
      "Face drooping on one side",
      "Slurred speech or trouble speaking",
      "Weakness on one side of the body",
      "Seizure or convulsions",
      "Shaking hands or tremors",
    ],
  },
  {
    name: "Cardiovascular & Respiratory",
    symptoms: [
      "Chest pain or tightness",
      "Pain radiating to left arm or jaw",
      "Shortness of breath",
      "Whistling or wheezing sound",
      "Cough lasting more than 3 weeks",
      "Coughing up blood",
      "Racing or fluttering heartbeat",
      "Swelling in ankles or legs",
      "Pain and swelling in one calf",
    ],
  },
  {
    name: "Gastrointestinal & Digestive",
    symptoms: [
      "Nausea and vomiting",
      "Stomach pain or belly cramps",
      "Severe pain in lower right belly",
      "Difficulty swallowing food",
      "Yellowing of skin or eyes",
      "Blood in stool or black stools",
      "Persistent loose watery stools",
    ],
  },
  {
    name: "Musculoskeletal & Skin",
    symptoms: [
      "Joint pain or aching joints",
      "Swollen red hot joints",
      "Difficulty moving or morning stiffness",
      "Generalized body ache",
      "Skin rash or red spots",
      "Changing mole or dark skin growth",
      "Sore or ulcer that does not heal",
    ],
  },
  {
    name: "Genitourinary & Hormonal",
    symptoms: [
      "Burning or painful urination",
      "Blood in urine",
      "Excessive thirst and frequent urination",
      "Abnormal vaginal bleeding",
    ],
  },
];

/* ─────────────── speech recognition hook ─────────────── */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
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
  const [activeCategoryTab, setActiveCategoryTab] = React.useState<string>("All");
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

  const isListeningRef = React.useRef(false);
  const recRef = React.useRef<SpeechRecognitionLike | null>(null);
  const baseRef = React.useRef("");

  React.useEffect(() => {
    const rec = getRecognition();
    setSupported(rec !== null || typeof window === "undefined" ? true : false);
    const w = window as unknown as Record<string, unknown>;
    if (!(w.SpeechRecognition || w.webkitSpeechRecognition)) setSupported(false);

    return () => {
      isListeningRef.current = false;
      if (recRef.current) {
        try {
          recRef.current.abort();
        } catch {}
      }
    };
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
    isListeningRef.current = false;
    setListening(false);
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        try {
          recRef.current.abort();
        } catch {}
      }
      recRef.current = null;
    }
  }

  async function startRecognition() {
    setSpeechError(null);
    setResult(null);

    // Stop any existing recognition instance cleanly
    if (recRef.current) {
      try {
        recRef.current.abort();
      } catch {}
      recRef.current = null;
    }

    // Explicitly request browser microphone permission via getUserMedia
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (micErr: unknown) {
        const errName = (micErr as { name?: string })?.name;
        if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
          setSpeechError("Microphone permission was denied. Please click the lock or settings icon in your browser address bar to allow microphone access.");
          setListening(false);
          isListeningRef.current = false;
          return;
        } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
          setSpeechError("No microphone hardware was detected on your computer. Please connect a microphone or use keyboard typing.");
          setListening(false);
          isListeningRef.current = false;
          return;
        }
      }
    }

    const rec = getRecognition();
    if (!rec) {
      setSupported(false);
      setSpeechError("Voice recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge, or type your symptoms.");
      return;
    }

    baseRef.current = text.trim();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let sessionTranscript = "";
      for (let i = 0; i < e.results.length; i++) {
        sessionTranscript += e.results[i][0].transcript + " ";
      }
      sessionTranscript = sessionTranscript.trim();
      if (sessionTranscript) {
        setInputMode("voice");
        setEditedAfter(false);
        const combined = baseRef.current
          ? `${baseRef.current} ${sessionTranscript}`
          : sessionTranscript;
        setText(combined);
      }
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech") {
        // Harmless pause while user is thinking; keep listening
        return;
      }
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setSpeechError("Microphone access is blocked. Please allow microphone permissions in your browser address bar.");
        isListeningRef.current = false;
        setListening(false);
      } else if (e.error === "network") {
        setSpeechError("Voice recognition network service is temporarily unavailable. You can type your symptoms or select chips below.");
        isListeningRef.current = false;
        setListening(false);
      } else if (e.error !== "aborted") {
        setSpeechError(`Microphone notice (${e.error}). You can continue typing your symptoms.`);
        isListeningRef.current = false;
        setListening(false);
      }
    };

    rec.onend = () => {
      if (isListeningRef.current) {
        try {
          rec.start();
        } catch {
          isListeningRef.current = false;
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    recRef.current = rec;
    isListeningRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch (err) {
      setSpeechError(err instanceof Error ? err.message : "Could not start the microphone.");
      isListeningRef.current = false;
      setListening(false);
    }
  }

  function reset() {
    baseRef.current = "";
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

  // Filter symptoms according to selected category tab
  const displayedCategories =
    activeCategoryTab === "All"
      ? SYMPTOM_PRESET_CATEGORIES
      : SYMPTOM_PRESET_CATEGORIES.filter((c) => c.name.toLowerCase().includes(activeCategoryTab.toLowerCase()));

  return (
    <>
      <PageHeader
        kicker="WHO ICD-11 & MedlinePlus Aligned"
        title="Multi-Symptom Disease & Clinical Intelligence System"
        description="Select or describe any combination of symptoms across oncology, cardiology, neurology, infectious disease, and rare conditions for comprehensive differential decision support."
      />

      {/* classification standard notice */}
      <Card className="mb-6 border-info/30 bg-info/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <BookOpen className="mt-0.5 size-4 shrink-0 text-info" />
          <div className="space-y-1 text-muted-foreground">
            <p className="font-semibold text-foreground">
              WHO ICD-11 International Medical Terminology & MedlinePlus Standard
            </p>
            <p>
              This intelligence system cross-references patient presentations against structured WHO ICD-11 disease classifications, NCCN oncology red-flag protocols, and MedlinePlus clinical evidence. All outputs represent informational decision support and require formal in-person clinician confirmation.
            </p>
          </div>
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
                    Critical Emergency: Immediate Hospital Care Required
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
                    <PhoneCall className="size-4" /> Call 112 (Emergency Services)
                  </a>
                  <p className="text-xs font-semibold text-destructive">
                    Do not wait for a routine appointment. Proceed immediately to the nearest Emergency Center.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cancer Warning Signs Safety Alert */}
          {r.analysis.cancerWarningsDetected && r.analysis.cancerWarningsDetected.length > 0 && (
            <Card className="border border-amber-500/50 bg-amber-500/10 shadow-sm">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200">
                  <ShieldAlert className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <h4 className="font-bold uppercase tracking-wider text-sm">
                    Clinical Oncology Red-Flag Screening Alert
                  </h4>
                </div>
                <p className="text-xs text-foreground/90 leading-relaxed">
                  The following recognized clinical warning sign(s) were identified in your presentation:
                </p>
                <div className="flex flex-wrap gap-2">
                  {r.analysis.cancerWarningsDetected.map((w) => (
                    <Badge
                      key={w.symptomId}
                      className="bg-amber-500/20 text-amber-950 dark:text-amber-100 border-amber-500/40 text-xs py-1"
                    >
                      Warning: {w.warningName}
                    </Badge>
                  ))}
                </div>
                <div className="rounded border border-amber-500/30 bg-background/80 p-3 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Essential Cancer Safety Information: </span>
                  Symptoms alone can <span className="font-semibold">NEVER confirm or rule out cancer</span>. Many warning signs stem from common, non-cancerous conditions. However, timely evaluation by an Oncologist or Specialist involving physical examination, diagnostic imaging (e.g., CT, MRI, Ultrasound, Mammography), and histological tissue biopsy is required for accurate medical diagnosis.
                </div>
              </CardContent>
            </Card>
          )}

          {/* Possible Conditions & Differential Analysis */}
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="size-5 text-primary" />
                  <CardTitle className="text-lg">Differential Clinical Analysis & Possible Conditions</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-mono">
                    WHO ICD-11 Reference
                  </Badge>
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
                    Triage: {r.analysis.urgency}
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Evidence-based pattern correlation using ICD-11 terminology. Preliminary differential decision support — not a definitive medical diagnosis.
              </p>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              {r.analysis.possibleConditions && r.analysis.possibleConditions.length > 0 ? (
                <div className="space-y-4">
                  {r.analysis.possibleConditions.map((cond) => (
                    <div
                      key={cond.id}
                      className="rounded-lg border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 space-y-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-serif text-lg font-bold text-foreground">
                            {cond.name}
                          </h4>
                          {cond.icd11Code && (
                            <Badge
                              variant="secondary"
                              className="font-mono text-xs bg-muted text-muted-foreground border border-border"
                            >
                              ICD-11: {cond.icd11Code}
                            </Badge>
                          )}
                          <Badge
                            variant="default"
                            className="bg-primary/90 text-primary-foreground font-mono text-xs"
                          >
                            {cond.matchScore}% Overlap
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
                        <div className="flex items-center gap-2">
                          {cond.category && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              {cond.category}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-xs font-semibold">
                            Dept: {cond.department}
                          </Badge>
                        </div>
                      </div>

                      <p className="text-sm text-foreground/90 leading-relaxed">
                        {cond.description}
                      </p>

                      {/* Matching symptoms */}
                      {cond.matchedSymptoms.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Matching symptoms identified:
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

                      {/* Missing classic symptoms */}
                      {cond.missingClassicSymptoms && cond.missingClassicSymptoms.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Classic symptoms not reported:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {cond.missingClassicSymptoms.map((sym) => (
                              <Badge
                                key={sym}
                                variant="outline"
                                className="text-xs text-muted-foreground border-dashed"
                              >
                                Absent: {sym}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Cancer Safety Disclaimer for Oncology conditions */}
                      {cond.cancerSafetyDisclaimer && (
                        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                          <span className="font-semibold">Diagnostic Requirement: </span>
                          {cond.cancerSafetyDisclaimer}
                        </div>
                      )}

                      {/* Recommended next steps */}
                      <div className="rounded border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed mt-2">
                        <span className="font-semibold text-primary">Recommended Clinical Next Steps: </span>
                        <span className="text-foreground/90">{cond.nextSteps}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <Info className="size-4 text-info" />
                    <span>Inconclusive / No specific disease pattern matched</span>
                  </div>
                  <p>
                    The combination of symptoms entered did not match a specific disease entity in our clinical knowledge base. Many conditions share non-specific features.
                  </p>
                  <p>
                    We recommend scheduling an in-person physical examination with a General Physician for formal clinical evaluation and baseline lab testing.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recommended Department & Real Hospital Clinician */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recommended Specialty Department
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
                    <span className="font-semibold">Alternative specialties:</span>{" "}
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
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      No specialist is currently listed for <span className="font-semibold">{r.analysis.suggestedDepartment}</span> in this hospital&apos;s directory.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Please consult <Link href="/patient/appointments?dept=General%20Medicine" className="text-primary underline">General Medicine</Link> or contact the hospital front desk for an external specialty referral.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Other available clinicians in this facility */}
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

          {/* Symptom Extraction & Clinical Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Recognized Symptoms & Transparency Review
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {r.analysis.symptoms.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Recognized symptoms in your submission:
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
                    <ClipboardEdit className="size-4" /> Recommended clinical points to mention to your clinician:
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
                <span>Select Symptoms by Clinical Category</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {selectedSymptoms.length} selected
                </span>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Browse categories or use the search box to add symptoms. Select as many as apply to your current condition.
              </p>

              {/* Category Filter Tabs */}
              <div className="flex flex-wrap gap-1.5 pt-2">
                {["All", "Constitutional", "Neurological", "Cardiovascular", "Digestive", "Musculoskeletal", "Genitourinary"].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveCategoryTab(tab)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      activeCategoryTab === tab
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                {displayedCategories.map((cat) => (
                  <div key={cat.name} className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {cat.name}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {cat.symptoms.map((preset) => {
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
                  </div>
                ))}
              </div>

              {/* Custom symptom input */}
              <div className="flex items-center gap-2 pt-3 border-t">
                <input
                  type="text"
                  className="h-9 flex-1 rounded border border-border bg-card px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder='Type any other symptom (e.g. "pain behind the eyes", "unexplained weight loss", "coughing blood")'
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
                    <span>Active Selected Symptoms ({selectedSymptoms.length}):</span>
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
                <span>Free-Text Clinical Narrative or Voice Dictation (Optional)</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {editedAfter ? "edited by you" : inputMode === "voice" ? "from voice" : "typed"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                className="min-h-24 w-full rounded border border-border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                placeholder='Optionally describe duration, severity, or additional context (e.g. "I have had a high fever and severe headache for 4 days with nausea but no cough")'
                value={text}
                maxLength={2000}
                onChange={(e) => {
                  setText(e.target.value);
                  setInputMode(e.target.value ? inputMode : "text");
                  setEditedAfter(true);
                  stopRecognition();
                }}
                aria-label="Additional clinical symptom details"
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
                    ? `${selectedSymptoms.length} symptom(s) active`
                    : "Select chips or type description"}
                </p>
                <Button
                  onClick={submit}
                  disabled={busy || (selectedSymptoms.length === 0 && text.trim().length < 3)}
                  className="font-semibold"
                >
                  {busy ? "Evaluating clinical profile…" : "Evaluate Symptoms"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* past assessments from DB */}
      <PastAssessments
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
