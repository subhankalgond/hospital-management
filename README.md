# CarePulse — Smart Hospital Platform

A full-stack hospital management system: patient & doctor portals, appointments
with live queueing, billing, labs, wards, an AI-assisted Emergency Center with
triage, smart bed management, and a machine-learning layer (length-of-stay
forecasting, NLP symptom routing, HL7 FHIR interoperability).

**Stack**: Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS ·
Drizzle ORM · Supabase Postgres · scikit-learn (training) · Vercel (hosting)

---

## Quick start (local)

```bash
# 1. install dependencies
npm install

# 2. create .env.local with your Supabase pooled connection string:
#    DATABASE_URL=postgresql://... (Project Settings → Database → Connection pooling)
#    (a local Postgres URL also works; without any DB the app falls back to an
#     embedded PGlite dev database automatically)

# 3. run
npm run dev            # → http://localhost:3000
```

The schema (including ML/Emergency/Bed tables) is auto-created on first boot.

---

## Evaluation deliverables (coordinator deadlines)

| Deadline | Deliverable | Status | Where |
|---|---|---|---|
| **Oct 20** — Working REST API returning FHIR-compliant patient entries | ✅ Done | FHIR R4 facade |
| **Nov 10** — Model script returning predicted discharge dates for new patient entries | ✅ Done | `ml/` + `/api/ml/los` |
| **Dec 01** — Automatically route symptoms to appropriate medical specialties | ✅ Done | NLP router |
| **Dec 18** — Complete interactive web application + public deployment URL | ✅ Done | this app, deployed |

### Oct 20 — FHIR R4 REST API

Standard HL7 FHIR R4 REST endpoints backed by the live CarePulse database:

```
GET  /api/fhir/metadata            # CapabilityStatement (server conformance)
GET  /api/fhir/Patient             # searchset Bundle (?name=&email=&identifier=)
GET  /api/fhir/Patient/{id}        # Patient resource (404 → OperationOutcome)
POST /api/fhir/Patient             # create from FHIR Patient JSON → 201
GET  /api/fhir/Appointment         # Bundle (?patient=Patient/{id}&date=)
GET  /api/fhir/Observation         # visit vitals as LOINC-coded Observations
```

Quick check:

```bash
curl -s "$BASE/api/fhir/metadata" | jq .resourceType          # CapabilityStatement
curl -s "$BASE/api/fhir/Patient?name=a" | jq .resourceType    # Bundle
curl -s -X POST "$BASE/api/fhir/Patient" -H 'Content-Type: application/json' \
  -d '{"resourceType":"Patient","name":[{"text":"Ada Lovelace"}],"gender":"female","birthDate":"1990-12-10"}'
```

Patient entries map to full FHIR Patient resources: `identifier`
(CarePulse + MR namespaces), `name` (family/given), `telecom`, `gender`,
`birthDate`, `address`, next-of-kin `contact`. Vitals map to LOINC-coded
Observations (BP panel 85354-9 with systolic/diastolic components, HR 8867-4,
SpO₂ 59408-5, temperature 8310-5, weight 29463-7). References:
[hl7.org/fhir](http://hl7.org/fhir/patient.html),
[tactionsoft FHIR tutorial](https://www.tactionsoft.com/blog/hl7-fhir-integration-tutorial/),
[medblocks FHIR 101](https://medblocks.com/blog/fhir-101-creating-your-first-patient-resource-like-a-pro).

### Nov 10 — LOS prediction model

Ensemble model (RandomForest vs HistGradientBoosting compared; best by MAE
selected) trained with scikit-learn on admission logs
([MIMIC-III-style features](https://www.kaggle.com/datasets/ihssanened/mimic-iii-clinical-databaseopen-access):
age, triage priority, comorbidity count, ICU admission, emergency vs planned,
ward type, night/weekend admission).

**Held-out metrics: MAE 1.25 days · R² 0.67.**

The trained forest is exported to `ml/los_model.json` and evaluated in pure
TypeScript at runtime (no Python needed in production) — verified against
sklearn to within **0.05 days** (`scripts/parity_check.py`).

Model script returning predicted discharge dates for new patient entries:

```bash
# CLI (same JSON model the server uses)
node ml/predict_los.js --age 65 --priority CRITICAL --icu --comorbidities 3
# → {"predictedLosDays": 14.3, "expectedDischargeDate": "2026-10-13", ...}

# API
curl -s -X POST "$BASE/api/ml/los" -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{"age":65,"gender":"male","priority":"CRITICAL","emergency":true,
       "comorbidityCount":3,"admissionIcu":true,"wardType":"icu"}'
```

Re-train: `python ml/train_los.py` (regenerates `ml/los_model.json`, prints
candidate metrics). Integrated in the product: occupied beds on **Bed
management** show an *est. free {date}* chip from the model, and staff can
forecast stays in **AI Insights → Stay forecast**.

### Dec 01 — NLP symptom routing

A transparent hybrid classifier routes free-text symptoms to CarePulse
departments (Cardiology, Orthopedics, Pediatrics, …) and flags emergency
presentations:

1. **TF-IDF + LogisticRegression** trained on ~900 symptom phrases across 11
   classes (scikit-learn), exported to `ml/symptom_router.json`;
2. **anchor-term rule layer** — clinical keywords (e.g. "heart", "fracture",
   "menstrual") add transparent bonuses;
3. **urgency lexicon** — terms like *"crushing chest pain"*, *"unconscious"*
   steer the patient to the Emergency Center immediately.

Evaluated on a **held-out set of 20 unseen phrasings: 90% accuracy**
(`ml/train_symptom_router.py` prints per-miss diagnostics).

```bash
curl -s -X POST "$BASE/api/nlp/symptoms" -H 'Content-Type: application/json' \
  -b cookies.txt -d '{"text":"chest pain and sweating since morning"}'
# → {"department":"Cardiology","confidence":0.61,"urgency":{"isEmergency":false,...}}
```

In the product: patients see **"Ask the AI router"** in the booking dialog
(suggests the department, one click filters doctors), and the **Emergency
Center** case form shows a live AI department suggestion as staff type
(staff can override — decision support only, never auto-decision).

### Dec 18 — Interactive web app + deployment

The complete application is the web app itself: portals for patients, doctors
and admins; appointments; emergency triage; bed management; billing; labs; and
the AI Insights workspace. It runs locally (`npm run dev`) and is deployed on
Vercel; the repository is this codebase.

---

## AI safety notices

All AI features are **decision-support demonstrations** and are labeled as
such in the UI. They do not diagnose disease, do not replace assessment by
qualified medical professionals, and never make irreversible decisions
automatically (triage requires staff confirmation; department suggestions are
pre-fills the user can change).

## Modules

- **Patient portal** — doctors, appointments with slot picking, health records, billing, profile
- **Doctor portal** — today's queue, patients, schedule with leave requests (1-day rule)
- **Admin** — dashboard, appointments, staff, wards, billing, laboratory
- **Emergency Center** — walk-in/registered case intake, validated vitals, rule-based AI-assisted triage (DEMO decision-support) with mandatory staff confirmation, priority queue, case timeline, bed recommendation
- **Bed management** — live bed grid, full lifecycle (available → reserved → occupied → discharge-pending → cleaning → inspection → available, plus maintenance), audit trail, ML discharge estimates
- **AI Insights** — symptom router playground, LOS forecaster, FHIR API explorer
