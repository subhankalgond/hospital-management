"use client";

import * as React from "react";
import { Brain, Loader2, Route, Stethoscope, FileJson, AlertTriangle, Info } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Progress,
  StatCard,
  Textarea,
} from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/overlays";
import { PageHeader } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEPARTMENT_NAMES } from "@/lib/defaults";
import type { Role } from "@/lib/types";

/* ═══════════════════════ Tab 1 — LOS Predictor ═══════════════════════ */

type LosResult = {
  losDays: number;
  expectedDischargeDate: string;
  model: string;
  metrics: { mae: number; r2: number };
  disclaimer: string;
};

function LosPredictor() {
  const [age, setAge] = React.useState("58");
  const [gender, setGender] = React.useState("male");
  const [priority, setPriority] = React.useState("URGENT");
  const [emergency, setEmergency] = React.useState(true);
  const [comorbidityCount, setComorbidityCount] = React.useState("2");
  const [icu, setIcu] = React.useState(false);
  const [wardType, setWardType] = React.useState("semi-private");
  const [night, setNight] = React.useState(false);
  const [weekend, setWeekend] = React.useState(false);
  const [result, setResult] = React.useState<LosResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ml/los", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: Number(age),
          gender,
          priority,
          emergency,
          comorbidityCount: Number(comorbidityCount),
          admissionIcu: icu,
          wardType,
          nightAdmission: night,
          weekendAdmission: weekend,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Prediction failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Prediction failed");
    } finally {
      setBusy(false);
    }
  }

  const num = React.useCallback((v: string, set: (s: string) => void) => ({
    value: v,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(/[^\d]/g, "")),
  }), []);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Stethoscope className="size-4 text-primary" /> Patient profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Age *</Label>
              <Input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/[^\d]/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Triage priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                  <SelectItem value="URGENT">URGENT</SelectItem>
                  <SelectItem value="MODERATE">MODERATE</SelectItem>
                  <SelectItem value="LOW">LOW</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Chronic conditions</Label>
              <Input inputMode="numeric" {...num(comorbidityCount, setComorbidityCount)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Ward type</Label>
              <Select value={wardType} onValueChange={setWardType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="semi-private">Semi-private</SelectItem>
                  <SelectItem value="icu">ICU</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            {[
              ["Emergency admission", emergency, setEmergency] as const,
              ["ICU admission", icu, setIcu] as const,
              ["Admitted at night", night, setNight] as const,
              ["Admitted on weekend", weekend, setWeekend] as const,
            ].map(([label, val, set], i) => (
              <label key={i} className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
                {label}
              </label>
            ))}
          </div>
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
          <Button onClick={run} disabled={busy} className="w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Brain className="size-4" />}
            {busy ? "Predicting…" : "Predict length of stay"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Forecast</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!result && (
            <p className="rounded-lg bg-muted/60 px-3 py-6 text-center text-sm text-muted-foreground">
              Fill the profile and run a prediction to see the expected length of stay and discharge date.
            </p>
          )}
          {result && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard label="Predicted stay" value={`${result.losDays} days`} sub={`model: ${result.model}`} />
                <StatCard label="Expected discharge" value={result.expectedDischargeDate} sub="from today" />
              </div>
              <div className="space-y-1.5 rounded-xl border p-3">
                <p className="text-xs font-medium text-muted-foreground">Model quality (held-out test)</p>
                <div className="flex items-center gap-3">
                  <span className="w-24 text-xs">MAE {result.metrics.mae}d</span>
                  <Progress value={Math.max(5, Math.min(100, result.metrics.r2 * 100))} />
                  <span className="text-xs">R² {result.metrics.r2}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{result.disclaimer}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════ Tab 2 — Symptom Router ═══════════════════════ */

type Routing = {
  department: string;
  confidence: number;
  alternatives: { department: string; confidence: number }[];
  urgency: { isEmergency: boolean; matchedTerms: string[]; note: string };
  matchedAnchors: string[];
  disclaimer: string;
};

const EXAMPLES = [
  "chest pain and sweating since morning",
  "my daughter has fever and rash",
  "knee pain when climbing stairs",
  "feel very anxious and cannot sleep",
  "severe headache with blurred vision",
];

function SymptomRouter() {
  const [text, setText] = React.useState("");
  const [result, setResult] = React.useState<Routing | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function run(t: string) {
    if (!t.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/nlp/symptoms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Routing failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Routing failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Route className="size-4 text-primary" /> Describe your symptoms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. chest tightness and sweating since morning…"
          />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => { setText(ex); run(ex); }}
                className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
          <Button onClick={() => run(text)} disabled={busy || !text.trim()} className="w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Route className="size-4" />}
            {busy ? "Analyzing…" : "Suggest department"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {result?.urgency.isEmergency && (
          <Card className="border-destructive/40">
            <CardContent className="flex items-start gap-3 pt-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">Emergency warning</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{result.urgency.note}</p>
                <p className="mt-1 text-xs text-muted-foreground">Matched: {result.urgency.matchedTerms.join(", ")}</p>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle>Suggested department</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!result && (
              <p className="rounded-lg bg-muted/60 px-3 py-6 text-center text-sm text-muted-foreground">
                Type symptoms above — the router suggests the right department and flags emergencies.
              </p>
            )}
            {result && (
              <>
                <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                  <span className="font-semibold">{result.department}</span>
                  <Badge>{Math.round(result.confidence * 100)}% confidence</Badge>
                </div>
                {result.alternatives.map((a) => (
                  <div key={a.department} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{a.department}</span>
                      <span className="text-xs">{Math.round(a.confidence * 100)}%</span>
                    </div>
                    <Progress value={Math.max(2, a.confidence * 100)} />
                  </div>
                ))}
                {result.matchedAnchors.length > 0 && (
                  <p className="text-xs text-muted-foreground">Key terms matched: {result.matchedAnchors.slice(0, 6).join(", ")}</p>
                )}
                <p className="text-xs text-muted-foreground">{result.disclaimer}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ═══════════════════════ Tab 3 — FHIR Explorer ═══════════════════════ */

function FhirExplorer() {
  const [resource, setResource] = React.useState("Patient");
  const [query, setQuery] = React.useState("");
  const [data, setData] = React.useState<unknown>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const qs = query.trim() ? `?${query.trim().replace(/^\?/, "")}` : "";
      const res = await fetch(`/api/fhir/${resource}${qs}`);
      const json = await res.json();
      if (!res.ok && json.resourceType !== "OperationOutcome") throw new Error(`HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileJson className="size-4 text-primary" /> FHIR R4 API explorer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[200px_1fr_auto]">
            <Select value={resource} onValueChange={(v) => { setResource(v); setData(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="metadata">CapabilityStatement</SelectItem>
                <SelectItem value="Patient">Patient</SelectItem>
                <SelectItem value="Appointment">Appointment</SelectItem>
                <SelectItem value="Observation">Observation</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={resource === "Patient" ? "?name=… or ?email=…" : resource === "Observation" ? "?patient=<id>&code=8867-4" : "?patient=<id>&date=2026-09-20"}
            />
            <Button onClick={run} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileJson className="size-4" />}
              Run query
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Endpoints: <code className="rounded bg-muted px-1">GET /api/fhir/metadata</code>,{" "}
            <code className="rounded bg-muted px-1">GET/POST /api/fhir/Patient</code>,{" "}
            <code className="rounded bg-muted px-1">GET /api/fhir/Patient/[id]</code>,{" "}
            <code className="rounded bg-muted px-1">GET /api/fhir/Appointment</code>,{" "}
            <code className="rounded bg-muted px-1">GET /api/fhir/Observation</code> — standard FHIR searchset Bundles.
          </p>
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {data !== null && (
        <Card>
          <CardContent className="pt-4">
            <pre className="max-h-[420px] overflow-auto rounded-xl bg-muted/70 p-4 text-xs leading-relaxed scrollbar-thin">
              {JSON.stringify(data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════ Page ═══════════════════════ */

export default function AiInsightsPage() {
  const accounts = useStore((s) => s.accounts);
  const session = useStore((s) => s.session);
  const role: Role | undefined = session?.role ?? accounts.find((a) => a.id === session?.id)?.role;

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Insights"
        description="Machine-learning decision support: stay forecasting, symptom routing, and interoperability."
      />

      <div className="grid gap-3 sm:grid-cols-3">              <StatCard label="LOS model" value="MAE 1.25d" sub="RandomForest · R² 0.67" />
              <StatCard label="Symptom router" value="90% held-out" sub="TF-IDF + anchors · 11 classes" />
              <StatCard label="FHIR R4" value="5 resources" sub="Patient · Appointment · Observation" />
      </div>

      <Tabs defaultValue="symptoms">
        <TabsList>
          <TabsTrigger value="symptoms"><Route className="size-4" /> Symptom router</TabsTrigger>
          {(role === "admin" || role === "doctor") && (
            <TabsTrigger value="los"><Brain className="size-4" /> Stay forecast</TabsTrigger>
          )}
          {role === "admin" && (
            <TabsTrigger value="fhir"><FileJson className="size-4" /> FHIR explorer</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="symptoms" className="mt-4">
          <SymptomRouter />
        </TabsContent>
        <TabsContent value="los" className="mt-4">
          {role === "admin" || role === "doctor" ? <LosPredictor /> : null}
        </TabsContent>
        <TabsContent value="fhir" className="mt-4">
          {role === "admin" ? <FhirExplorer /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
