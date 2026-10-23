"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardContent, Input, Label, EmptyState } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/misc";
import {
  QrCode,
  ShieldCheck,
  ShieldAlert,
  Info,
  ExternalLink,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileCheck2,
  Ban,
  Share2,
} from "lucide-react";

interface AbhaLink {
  id: string;
  abhaNumber: string;
  abhaAddress: string;
  status: string;
  method: string;
  note: string;
  createdAt: string;
}

interface AbdmConsent {
  id: string;
  purpose: string;
  hiTypes: string[];
  rangeFrom: string;
  rangeTo: string;
  status: string;
  note: string;
  createdAt: string;
}

const HI_TYPES = [
  { id: "DiagnosticReport", label: "Diagnostic / Lab Reports" },
  { id: "Prescription", label: "Prescriptions & Medications" },
  { id: "DischargeSummary", label: "Discharge Summaries" },
  { id: "ImmunizationRecord", label: "Immunization Records" },
  { id: "OPConsultation", label: "OP Consultation Notes" },
];

export default function AbhaPage() {
  const session = useStore((s) => s.session)!;
  const [links, setLinks] = React.useState<AbhaLink[]>([]);
  const [consents, setConsents] = React.useState<AbdmConsent[]>([]);
  const [gatewayConnected, setGatewayConnected] = React.useState(false);
  const [gatewayNote, setGatewayNote] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [successNote, setSuccessNote] = React.useState<string | null>(null);

  // Link Form State
  const [method, setMethod] = React.useState<"manual" | "qr">("manual");
  const [abhaNumber, setAbhaNumber] = React.useState("");
  const [abhaAddress, setAbhaAddress] = React.useState("");
  const [qrRaw, setQrRaw] = React.useState("");
  const [linking, setLinking] = React.useState(false);

  // Consent Form State
  const [consentOpen, setConsentOpen] = React.useState(false);
  const [purpose, setPurpose] = React.useState("Care Management");
  const [selectedHiTypes, setSelectedHiTypes] = React.useState<string[]>([
    "DiagnosticReport",
    "Prescription",
    "DischargeSummary",
  ]);
  const [rangeFrom, setRangeFrom] = React.useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [rangeTo, setRangeTo] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [requestingConsent, setRequestingConsent] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/abha", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setLinks(data.links ?? []);
        setConsents(data.consents ?? []);
        setGatewayConnected(Boolean(data.gatewayConnected));
        setGatewayNote(data.note ?? "");
      } else {
        setActionError(data.error ?? "Could not load ABHA data.");
      }
    } catch {
      setActionError("Failed to reach server.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle QR string paste / simulated scan
  function handleQrInput(val: string) {
    setQrRaw(val);
    try {
      // ABDM QR format often contains JSON with hid, hidn
      const parsed = JSON.parse(val);
      if (parsed.hid) setAbhaNumber(parsed.hid);
      if (parsed.hidn) setAbhaAddress(parsed.hidn);
    } catch {
      // If delimited string format: 14-digit match
      const mNum = val.match(/\b\d{2}-\d{4}-\d{4}-\d{4}\b/);
      if (mNum) setAbhaNumber(mNum[0]);
      const mAddr = val.match(/\b[A-Za-z0-9._-]+@abdm\b/);
      if (mAddr) setAbhaAddress(mAddr[0]);
    }
  }

  // Submit ABHA Link
  async function submitLink() {
    if (linking) return;
    setLinking(true);
    setActionError(null);
    setSuccessNote(null);
    try {
      const res = await fetch("/api/abha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "identifier",
          abhaNumber: abhaNumber.trim(),
          abhaAddress: abhaAddress.trim(),
          method: method === "qr" ? "qr_scan" : "manual_entry",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error ?? "Could not link ABHA identifier.");
      } else {
        setSuccessNote("ABHA record registered. Status: Pending verification (Integration-Ready).");
        setAbhaNumber("");
        setAbhaAddress("");
        setQrRaw("");
        await loadData();
      }
    } catch {
      setActionError("Network error while submitting ABHA link.");
    } finally {
      setLinking(false);
    }
  }

  // Revoke Consent
  async function revokeConsent(id: string) {
    setActionError(null);
    try {
      const res = await fetch(`/api/abha?id=${encodeURIComponent(id)}&kind=consent`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error ?? "Could not revoke consent.");
      } else {
        setSuccessNote("Consent revoked. No health records will be shared under this authorization.");
        await loadData();
      }
    } catch {
      setActionError("Failed to revoke consent.");
    }
  }

  // Delete Link
  async function unlinkIdentifier(id: string) {
    setActionError(null);
    try {
      const res = await fetch(`/api/abha?id=${encodeURIComponent(id)}&kind=link`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error ?? "Could not unlink identifier.");
      } else {
        setSuccessNote("ABHA identifier removed from your record.");
        await loadData();
      }
    } catch {
      setActionError("Failed to unlink identifier.");
    }
  }

  // Submit Consent Request
  async function submitConsent() {
    if (requestingConsent) return;
    if (selectedHiTypes.length === 0) {
      setActionError("Select at least one health information type.");
      return;
    }
    setRequestingConsent(true);
    setActionError(null);
    setSuccessNote(null);
    try {
      const res = await fetch("/api/abha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "consent_request",
          purpose,
          hiTypes: selectedHiTypes,
          rangeFrom,
          rangeTo,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error ?? "Could not create consent request.");
      } else {
        setSuccessNote("Consent-based health information exchange request recorded.");
        setConsentOpen(false);
        await loadData();
      }
    } catch {
      setActionError("Network error submitting consent request.");
    } finally {
      setRequestingConsent(false);
    }
  }

  return (
    <>
      <PageHeader
        kicker="Ayushman Bharat Digital Mission (ABDM)"
        title="ABHA & Health Data Exchange"
        description="Official integration entry point for Ayushman Bharat Health Account (ABHA) and ABDM consent-based health data exchange."
        actions={
          <a
            href="https://abdm.gov.in/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Official ABDM Portal <ExternalLink className="size-3" />
          </a>
        }
      />

      {/* Official ABDM Integration Status Banner */}
      <div className="mb-6 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-primary" />
            <span>ABDM Integration Mode: {gatewayConnected ? "Gateway Connected (Active)" : "Integration-Ready Interface & Service Layer"}</span>
          </div>
          <Badge variant={gatewayConnected ? "success" : "secondary"}>
            {gatewayConnected ? "Verified Gateway" : "Sandbox / Ready"}
          </Badge>
        </div>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          {gatewayNote}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Notice: National health records exchange strictly complies with the National Health Authority (NHA) ABDM consent framework. No medical records are fetched without signed patient consent.
        </p>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          {actionError}
        </div>
      )}

      {successNote && (
        <div className="mb-4 rounded-lg border border-success/40 bg-success/10 p-3 text-xs text-success font-medium">
          ✓ {successNote}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ─── LEFT: ABHA Identifier Registration ─── */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="border-b pb-3">
              <p className="font-semibold text-base flex items-center gap-2">
                <QrCode className="size-4 text-primary" /> Link Your ABHA Identifier
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Register your existing 14-digit ABHA Number or ABHA Address (@abdm).
              </p>
            </div>

            {/* Method switch */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod("manual")}
                className={
                  "rounded-lg border px-3 py-2 text-xs font-semibold transition-all " +
                  (method === "manual" ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")
                }
              >
                Manual Entry
              </button>
              <button
                type="button"
                onClick={() => setMethod("qr")}
                className={
                  "rounded-lg border px-3 py-2 text-xs font-semibold transition-all " +
                  (method === "qr" ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")
                }
              >
                Scan / Upload ABDM QR
              </button>
            </div>

            {method === "qr" && (
              <div className="space-y-2 rounded-lg border border-dashed p-3 bg-muted/20">
                <Label htmlFor="qr-input" className="text-xs">Paste ABDM QR Code Payload or String</Label>
                <Input
                  id="qr-input"
                  placeholder='e.g. {"hid":"14-1234-5678-9012","hidn":"rahul@abdm"} or scanned QR string'
                  value={qrRaw}
                  onChange={(e) => handleQrInput(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  The official ABDM QR scanner extracts your ABHA Number and Address directly without manual typing.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label htmlFor="abhaNumber">14-Digit ABHA Number</Label>
                <Input
                  id="abhaNumber"
                  value={abhaNumber}
                  onChange={(e) => setAbhaNumber(e.target.value)}
                  placeholder="XX-XXXX-XXXX-XXXX (e.g. 14-1234-5678-9012)"
                  className="font-mono"
                  maxLength={17}
                />
              </div>

              <div>
                <Label htmlFor="abhaAddress">ABHA Address (PHR Handle)</Label>
                <Input
                  id="abhaAddress"
                  value={abhaAddress}
                  onChange={(e) => setAbhaAddress(e.target.value)}
                  placeholder="username@abdm (e.g. rahul.sharma@abdm)"
                />
              </div>
            </div>

            <Button
              className="w-full"
              disabled={linking || (!abhaNumber.trim() && !abhaAddress.trim())}
              onClick={submitLink}
            >
              {linking ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Save ABHA Record
            </Button>

            <p className="text-[11px] text-muted-foreground text-center">
              Identifiers are stored with status <span className="font-semibold">Pending Verification</span> until authorized by the ABDM gateway.
            </p>
          </CardContent>
        </Card>

        {/* ─── RIGHT: Linked Identifiers List ─── */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="border-b pb-3">
              <p className="font-semibold text-base flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" /> Registered ABHA Records ({links.length})
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Current patient health identity identifiers linked to your hospital account.
              </p>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading ABHA records…</div>
            ) : links.length === 0 ? (
              <EmptyState
                emoji="🪪"
                title="No ABHA identifier linked yet"
                description="Link your ABHA number using the form to prepare for national health information exchange."
              />
            ) : (
              <div className="space-y-2.5">
                {links.map((link) => (
                  <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 bg-card">
                    <div>
                      {link.abhaNumber && (
                        <p className="font-mono text-sm font-bold text-foreground tracking-wider">{link.abhaNumber}</p>
                      )}
                      {link.abhaAddress && (
                        <p className="text-xs font-medium text-primary">{link.abhaAddress}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Linked via {link.method.replace("_", " ")} · {new Date(link.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={link.status === "verified" ? "success" : "secondary"}>
                        {link.status === "verified" ? "Verified" : "Unverified (Pending Gateway)"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => unlinkIdentifier(link.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── BOTTOM: Consent Management & Health Information Exchange ─── */}
      <Card className="mt-6">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div>
              <p className="font-semibold text-lg flex items-center gap-2">
                <Share2 className="size-5 text-primary" /> Consent-Based Health Information Exchange (ABDM Framework)
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Review, grant, or revoke consent for health records sharing with participating healthcare providers.
              </p>
            </div>
            <Button
              variant="gradient"
              size="sm"
              onClick={() => setConsentOpen(!consentOpen)}
            >
              <FileCheck2 className="size-4" /> {consentOpen ? "Close Form" : "New Consent Request"}
            </Button>
          </div>

          {/* New Consent Form */}
          {consentOpen && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="font-semibold text-sm text-foreground">Initiate Health Data Sharing Request</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="purpose">Exchange Purpose *</Label>
                  <select
                    id="purpose"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                  >
                    <option value="Care Management">Care Management & Clinical Treatment</option>
                    <option value="Disease Management">Chronic Disease Monitoring</option>
                    <option value="Health Assessment">Preventive Health Assessment</option>
                    <option value="Emergency Treatment">Emergency Medical Care</option>
                  </select>
                </div>

                <div>
                  <Label>Date Range for Health Records</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
                    <Input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
                  </div>
                </div>
              </div>

              <div>
                <Label className="block mb-1.5">Permitted Health Information Types</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {HI_TYPES.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-xs rounded border bg-card p-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedHiTypes.includes(t.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedHiTypes((prev) => [...prev, t.id]);
                          else setSelectedHiTypes((prev) => prev.filter((x) => x !== t.id));
                        }}
                      />
                      <span>{t.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setConsentOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={requestingConsent} onClick={submitConsent}>
                  {requestingConsent ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  Record Consent Request
                </Button>
              </div>
            </div>
          )}

          {/* Consents Table */}
          {consents.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No consent requests recorded. You have full control over data sharing and can revoke permissions anytime.
            </p>
          ) : (
            <div className="space-y-2">
              {consents.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{c.purpose}</p>
                      <Badge variant={c.status === "revoked" ? "destructive" : c.status === "active" ? "success" : "secondary"}>
                        {c.status.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      Types: {Array.isArray(c.hiTypes) ? c.hiTypes.join(", ") : "—"} · Range: {c.rangeFrom || "Any"} to {c.rangeTo || "Any"}
                    </p>
                    <p className="text-[10px] text-muted-foreground opacity-70">
                      Request ID: <span className="font-mono">{c.id}</span> · Created {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {c.status !== "revoked" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => revokeConsent(c.id)}
                    >
                      <Ban className="size-3.5" /> Revoke Consent
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
