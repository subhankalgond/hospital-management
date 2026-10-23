"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardContent, Input, Label, StatCard, EmptyState, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/misc";
import { dateLabel } from "@/lib/utils";
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Loader2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

const WF_BADGE: Record<string, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  ordered: { label: "Ordered", variant: "secondary" },
  awaiting_sample: { label: "Awaiting sample", variant: "warning" },
  sample_collected: { label: "Sample collected", variant: "sky" },
  processing: { label: "Processing", variant: "sky" },
  result_ready: { label: "Result ready", variant: "warning" },
  verified: { label: "Verified", variant: "success" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const FILTERS: { key: string; label: string; match: (w: string, s: string) => boolean }[] = [
  { key: "queue", label: "Active queue", match: (w) => !["verified", "cancelled"].includes(w) },
  { key: "all", label: "All", match: () => true },
  { key: "verified", label: "Verified", match: (w) => w === "verified" },
  { key: "cancelled", label: "Cancelled", match: (w) => w === "cancelled" },
];

export default function LabPanel() {
  const labs = useStore((s) => s.labs);
  const patients = useStore((s) => s.patients);
  const doctors = useStore((s) => s.doctors);
  const labAction = useStore((s) => s.labAction);
  const [filterKey, setFilterKey] = React.useState("queue");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [resultDraft, setResultDraft] = React.useState<Record<string, string>>({});
  const [err, setErr] = React.useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);

  React.useEffect(() => {
    useStore.getState().refresh();
    const iv = setInterval(() => useStore.getState().refresh(), 20_000);
    return () => clearInterval(iv);
  }, []);

  const f = FILTERS.find((x) => x.key === filterKey) ?? FILTERS[0];
  const filtered = labs
    .filter((l) => f.match(l.workflow ?? "ordered", l.status))
    .sort((a, b) => {
      const pr = { stat: 0, urgent: 1, routine: 2 } as Record<string, number>;
      return (pr[a.priority ?? "routine"] ?? 2) - (pr[b.priority ?? "routine"] ?? 2) ||
        (b.requestedOn ?? "").localeCompare(a.requestedOn ?? "");
    });

  const activeCount = labs.filter((l) => !["verified", "cancelled"].includes(l.workflow ?? "ordered")).length;
  const awaitingSample = labs.filter((l) => l.workflow === "ordered" || l.workflow === "awaiting_sample").length;
  const readyToVerify = labs.filter((l) => l.workflow === "result_ready").length;

  const pinfo = (id: string) => patients.find((p) => p.id === id);
  const dname = (id: string) => doctors.find((d) => d.id === id)?.name ?? "—";

  async function act(id: string, action: "collect" | "process" | "result" | "verify" | "cancel") {
    if (busyId) return;
    setBusyId(id);
    setErr(null);
    try {
      const res = await labAction(id, action, action === "result" ? resultDraft[id] ?? "" : undefined);
      if (!res.ok) setErr(res.error ?? "Action failed.");
      else if (action === "result") setResultDraft((d) => ({ ...d, [id]: "" }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        kicker="Laboratory"
        title="Laboratory"
        description="Tests ordered during consultations arrive automatically. Record the real sample, processing and result data — verification releases results to the doctor and the patient history."
        actions={
          <Button variant="gradient" onClick={() => setBulkOpen(true)}>
            <UploadCloud className="size-4" /> Bulk Upload Lab Result (CSV/PDF)
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active queue" value={String(activeCount)} tone={activeCount ? "warning" : "default"} />
        <StatCard label="Awaiting sample" value={String(awaitingSample)} />
        <StatCard label="Ready to verify" value={String(readyToVerify)} tone={readyToVerify ? "warning" : "default"} />
      </div>

      {err && <Card className="mt-5 border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{err}</Card>}

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <button
            key={x.key}
            onClick={() => setFilterKey(x.key)}
            className={
              "rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors " +
              (filterKey === x.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted")
            }
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {filtered.length === 0 && <EmptyState title="No lab orders here" />}

        {filtered.map((l) => {
          const wf = l.workflow ?? "ordered";
          const p = pinfo(l.patientId);
          const busy = busyId === l.id;
          const isUrgent = l.priority === "stat" || l.priority === "urgent";
          return (
            <Card key={l.id} className={isUrgent ? "border-warning/50" : undefined}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-serif text-lg">{l.test}</p>
                      {isUrgent && <Badge variant="warning">{l.priority === "stat" ? "STAT" : "Urgent"}</Badge>}
                      <Badge variant={WF_BADGE[wf]?.variant ?? "outline"}>{WF_BADGE[wf]?.label ?? wf}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Patient: <span className="font-medium text-foreground">{p?.name ?? "Unknown"}</span> (
                      <span className="font-mono text-xs">{p?.patientCode || l.patientId}</span>) · Ordered by {dname(l.doctorId)} ·{" "}
                      {l.requestedOn ? dateLabel(l.requestedOn.slice(0, 10)) : "—"}
                    </p>
                    {l.clinicalNote && <p className="mt-1 text-xs italic text-muted-foreground">Note: “{l.clinicalNote}”</p>}
                    {l.result && (
                      <div className="mt-2 rounded-lg bg-muted/60 p-3 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recorded Result:</p>
                        <p className="mt-0.5 font-medium whitespace-pre-wrap">{l.result}</p>
                      </div>
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{l.id}</span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
                  {wf === "ordered" && (
                    <Button size="sm" disabled={busy} onClick={() => act(l.id, "collect")}>
                      {busy ? "Updating…" : "Collect sample"}
                    </Button>
                  )}
                  {wf === "awaiting_sample" && (
                    <Button size="sm" disabled={busy} onClick={() => act(l.id, "collect")}>
                      {busy ? "Updating…" : "Sample collected"}
                    </Button>
                  )}
                  {wf === "sample_collected" && (
                    <Button size="sm" disabled={busy} onClick={() => act(l.id, "process")}>
                      {busy ? "Updating…" : "Start processing"}
                    </Button>
                  )}
                  {wf === "processing" && (
                    <>
                      <div className="w-full max-w-md">
                        <Label htmlFor={`res-${l.id}`}>Result values (actual data only)</Label>
                        <Input
                          id={`res-${l.id}`}
                          value={resultDraft[l.id] ?? ""}
                          placeholder="e.g. Hemoglobin 11.8 g/dL; WBC 7.2 ×10⁹/L"
                          onChange={(e) => setResultDraft((d) => ({ ...d, [l.id]: e.target.value.slice(0, 4000) }))}
                        />
                      </div>
                      <Button size="sm" disabled={busy} onClick={() => act(l.id, "result")}>
                        {busy ? "Saving…" : "Record result"}
                      </Button>
                    </>
                  )}
                  {wf === "result_ready" && (
                    <Button size="sm" disabled={busy} onClick={() => act(l.id, "verify")}>
                      {busy ? "Verifying…" : "Verify result"}
                    </Button>
                  )}
                  {!["verified", "cancelled"].includes(wf) && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(l.id, "cancel")}>
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ─── Bulk Upload Modal (CSV & PDF) ─── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent
          title="Bulk Upload Lab Results (CSV / PDF)"
          description="Import structured batch results via CSV or attach private PDF reports to orders."
          className="max-w-3xl"
        >
          <BulkUploadLabDialog
            labs={labs}
            patients={patients}
            onClose={() => setBulkOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─────────────────── Bulk Upload Lab Dialog ─────────────────── */

function BulkUploadLabDialog({
  labs,
  patients,
  onClose,
}: {
  labs: any[];
  patients: any[];
  onClose: () => void;
}) {
  const [tab, setTab] = React.useState<"csv" | "pdf">("csv");

  // CSV State
  const [csvText, setCsvText] = React.useState("");
  const [validating, setValidating] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [previewResult, setPreviewResult] = React.useState<any | null>(null);
  const [commitSummary, setCommitSummary] = React.useState<any | null>(null);
  const [csvError, setCsvError] = React.useState<string | null>(null);
  const [skipDuplicates, setSkipDuplicates] = React.useState(true);

  // PDF State
  const [selectedLabId, setSelectedLabId] = React.useState("");
  const [pdfFile, setPdfFile] = React.useState<File | null>(null);
  const [pdfBase64, setPdfBase64] = React.useState<string>("");
  const [uploadingPdf, setUploadingPdf] = React.useState(false);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = React.useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = React.useState(false);

  // Download official CSV template
  function downloadTemplate() {
    const header = "order_ref,lab_test,patient_code,result_text,unit,recorded_at";
    const example = `${header}\nLB-000001,Complete Blood Count,PAT-2026-000001,Hemoglobin 13.2 g/dL; WBC 6.8 x10^9/L,g/dL,2026-10-23T10:30:00Z`;
    const blob = new Blob([example], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "lab_results_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Handle CSV file selection
  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setCsvText(evt.target?.result as string || "");
      setPreviewResult(null);
      setCommitSummary(null);
      setCsvError(null);
    };
    reader.readAsText(file);
  }

  // Validate CSV
  async function handleValidate() {
    if (!csvText.trim()) {
      setCsvError("Paste or upload CSV content first.");
      return;
    }
    setValidating(true);
    setCsvError(null);
    setCommitSummary(null);
    try {
      const res = await fetch("/api/labs/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, validate: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setCsvError(data.error ?? "Validation failed.");
      } else {
        setPreviewResult(data);
      }
    } catch {
      setCsvError("Network error during validation.");
    } finally {
      setValidating(false);
    }
  }

  // Commit valid CSV rows
  async function handleCommit() {
    if (!csvText.trim()) return;
    setCommitting(true);
    setCsvError(null);
    try {
      const res = await fetch("/api/labs/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, validate: false, removeDuplicates: skipDuplicates }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setCsvError(data.error ?? "Import failed.");
      } else {
        setCommitSummary(data);
        setPreviewResult(null);
        await useStore.getState().refresh();
      }
    } catch {
      setCsvError("Network error during import commit.");
    } finally {
      setCommitting(false);
    }
  }

  // Handle PDF file selection
  function handlePdfSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPdfError(null);
    if (!file) {
      setPdfFile(null);
      setPdfBase64("");
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setPdfError("Only PDF files are supported.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPdfError("File size exceeds 5 MB limit.");
      return;
    }
    setPdfFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(",")[1];
      setPdfBase64(b64 || "");
    };
    reader.readAsDataURL(file);
  }

  // Load existing PDF files for selected lab
  const loadPdfFiles = React.useCallback(async (labId: string) => {
    if (!labId) {
      setUploadedFiles([]);
      return;
    }
    setLoadingFiles(true);
    try {
      const res = await fetch(`/api/labs/files?labId=${encodeURIComponent(labId)}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setUploadedFiles(data.files ?? []);
      }
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedLabId) {
      void loadPdfFiles(selectedLabId);
    }
  }, [selectedLabId, loadPdfFiles]);

  // Upload PDF report
  async function handleUploadPdf() {
    if (!selectedLabId || !pdfFile || !pdfBase64) {
      setPdfError("Select an order and choose a PDF file.");
      return;
    }
    setUploadingPdf(true);
    setPdfError(null);
    try {
      const res = await fetch("/api/labs/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labId: selectedLabId,
          filename: pdfFile.name,
          dataBase64: pdfBase64,
          mime: "application/pdf",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPdfError(data.error ?? "PDF upload failed.");
      } else {
        setPdfFile(null);
        setPdfBase64("");
        await loadPdfFiles(selectedLabId);
      }
    } catch {
      setPdfError("Network error during PDF upload.");
    } finally {
      setUploadingPdf(false);
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-2">
          <TabsTrigger value="csv" className="flex items-center gap-2">
            <FileSpreadsheet className="size-4" /> CSV Bulk Upload
          </TabsTrigger>
          <TabsTrigger value="pdf" className="flex items-center gap-2">
            <FileText className="size-4" /> PDF Report Upload
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: CSV BULK UPLOAD ─── */}
        <TabsContent value="csv" className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3 text-xs">
            <div>
              <p className="font-semibold text-foreground">CSV Format Specifications:</p>
              <code className="text-[11px] text-muted-foreground">order_ref,lab_test,patient_code,result_text,unit,recorded_at</code>
            </div>
            <Button size="sm" variant="outline" onClick={downloadTemplate} className="gap-1.5">
              <Download className="size-3.5" /> Download Template
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="csv-file-input">Upload CSV File or Paste Raw Text</Label>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFile}
                className="text-xs file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs"
              />
            </div>
            <Textarea
              rows={5}
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setPreviewResult(null);
                setCommitSummary(null);
              }}
              placeholder="order_ref,lab_test,patient_code,result_text,unit,recorded_at&#10;LB-000001,Complete Blood Count,PAT-2026-000001,Hemoglobin 13.2 g/dL; WBC 6.8 x10^9/L,g/dL,2026-10-23T10:30:00Z"
              className="font-mono text-xs"
            />
          </div>

          {csvError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              {csvError}
            </div>
          )}

          {/* Validation Preview Results */}
          {previewResult && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <p className="font-semibold text-sm">Validation Preview</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-success font-medium">✓ {previewResult.validCount} valid</span>
                  <span className="text-destructive font-medium">✗ {previewResult.invalidRows?.length ?? 0} with errors</span>
                  <span className="text-warning font-medium">⚠ {previewResult.duplicates?.length ?? 0} duplicate results</span>
                </div>
              </div>

              {/* Header errors */}
              {previewResult.headerProblems?.length > 0 && (
                <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                  {previewResult.headerProblems.map((h: string, i: number) => (
                    <p key={i}>• {h}</p>
                  ))}
                </div>
              )}

              {/* Invalid Rows Table */}
              {previewResult.invalidRows?.length > 0 && (
                <div className="max-h-36 overflow-y-auto space-y-1">
                  <p className="text-xs font-semibold text-destructive">Invalid rows (will be skipped):</p>
                  {previewResult.invalidRows.map((inv: any, idx: number) => (
                    <div key={idx} className="rounded bg-destructive/10 px-2.5 py-1 text-xs text-destructive flex justify-between">
                      <span>Row {inv.row}: {inv.orderRef || "—"} ({inv.patientCode || "—"})</span>
                      <span>{inv.problems.join("; ")}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Duplicates notice */}
              {previewResult.duplicates?.length > 0 && (
                <div className="rounded bg-warning/10 p-2 text-xs text-warning">
                  <p className="font-medium">Existing results detected on {previewResult.duplicates.length} order(s).</p>
                  <label className="mt-1 flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                      className="rounded"
                    />
                    Skip duplicate orders to prevent silently overwriting existing verified results (Recommended)
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Commit Summary */}
          {commitSummary && (
            <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-xs text-success space-y-1.5">
              <p className="font-bold flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="size-4" /> Bulk Import Completed Successfully
              </p>
              <p>• {commitSummary.committed} laboratory results imported and updated to status Result Ready.</p>
              <p>• {commitSummary.skippedDuplicates} duplicate orders skipped safely.</p>
              <p>• {commitSummary.invalidSkipped} invalid rows skipped.</p>
              <p className="text-[11px] opacity-80 pt-1">Audit trail logged: {commitSummary.summary}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {!previewResult && !commitSummary && (
              <Button disabled={validating || !csvText.trim()} onClick={handleValidate}>
                {validating ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
                Validate & Preview CSV
              </Button>
            )}
            {previewResult && (
              <Button
                variant="gradient"
                disabled={committing || previewResult.validCount === 0}
                onClick={handleCommit}
              >
                {committing ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Commit {previewResult.validCount} Valid Results
              </Button>
            )}
          </div>
        </TabsContent>

        {/* ─── TAB 2: PDF REPORT UPLOAD ─── */}
        <TabsContent value="pdf" className="space-y-4 pt-2">
          <div className="space-y-3">
            <div>
              <Label htmlFor="pdf-lab-select">Target Lab Order *</Label>
              <select
                id="pdf-lab-select"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedLabId}
                onChange={(e) => setSelectedLabId(e.target.value)}
              >
                <option value="">Select a lab order…</option>
                {labs.map((l) => {
                  const pt = patients.find((p) => p.id === l.patientId);
                  return (
                    <option key={l.id} value={l.id}>
                      {l.id} — {l.test} ({pt?.name ?? "Unknown"}, {pt?.patientCode || l.patientId}) · {l.workflow}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <Label htmlFor="pdf-file-picker">Select PDF Report File (Max 5 MB) *</Label>
              <Input
                id="pdf-file-picker"
                type="file"
                accept="application/pdf"
                onChange={handlePdfSelect}
                className="mt-1"
              />
              {pdfFile && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Selected: <span className="font-semibold text-foreground">{pdfFile.name}</span> ({(pdfFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            {pdfError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                {pdfError}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                disabled={uploadingPdf || !selectedLabId || !pdfFile}
                onClick={handleUploadPdf}
              >
                {uploadingPdf ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                Upload PDF Report (Private Storage)
              </Button>
            </div>

            {/* Uploaded Files for this Lab Order */}
            {selectedLabId && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Attached PDF Reports ({uploadedFiles.length})
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => loadPdfFiles(selectedLabId)}>
                    <RefreshCw className="size-3" /> Refresh
                  </Button>
                </div>

                {loadingFiles && <p className="text-xs text-muted-foreground">Loading reports…</p>}

                {uploadedFiles.length === 0 && !loadingFiles && (
                  <p className="text-xs text-muted-foreground italic">No PDF reports uploaded for this order yet.</p>
                )}

                <div className="space-y-1.5">
                  {uploadedFiles.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between rounded-lg border bg-card p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="size-4 text-primary" />
                        <div>
                          <p className="font-medium text-foreground">{f.filename}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {(f.size / 1024).toFixed(1)} KB · Uploaded {new Date(f.uploadedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={f.reviewStatus === "verified" ? "success" : "secondary"}>
                          {f.reviewStatus}
                        </Badge>
                        <a
                          href={`/api/labs/files/${f.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium hover:bg-muted"
                        >
                          <Download className="size-3" /> Download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
