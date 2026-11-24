/**
 * CarePulse — Medical Knowledge Base & Clinical Intelligence Types
 * 
 * Complies with WHO ICD-11 international terminology and MedlinePlus
 * clinical definitions for patient-centered differential decision support.
 */

export interface ICD11Reference {
  /** WHO ICD-11 classification code (e.g., "1D00", "2B60", "BA41") */
  code: string;
  /** Official WHO ICD-11 classification title */
  title: string;
  /** WHO ICD-11 Chapter */
  chapter: string;
  /** Direct link to WHO ICD-11 browser */
  uri?: string;
}

export interface MedicalSource {
  name: string;
  url: string;
  citation: string;
  license: string;
}

export type BodySystem =
  | "constitutional"
  | "head-neck"
  | "chest-cardiopulmonary"
  | "abdomen-gastrointestinal"
  | "pelvis-genitourinary"
  | "musculoskeletal"
  | "skin-integumentary"
  | "neurological"
  | "psychological";

export type DiseaseCategory =
  | "Oncology"
  | "Infectious Diseases"
  | "Cardiovascular"
  | "Neurology"
  | "Respiratory"
  | "Gastroenterology & Hepatology"
  | "Nephrology & Urology"
  | "Endocrine & Metabolic"
  | "Hematology"
  | "Autoimmune & Rheumatology"
  | "Dermatology"
  | "Musculoskeletal & Orthopedics"
  | "Mental Health"
  | "Reproductive & Women's Health"
  | "Ophthalmology & ENT"
  | "Genetic & Rare Diseases"
  | "Pediatrics";

export interface SymptomDefinition {
  id: string;
  standardMedicalName: string;
  patientFriendlyName: string;
  synonyms: string[];
  spellingVariations: string[];
  bodyLocation: BodySystem;
  category: string;
  isEmergencyIndicator: boolean;
  isCancerWarningSign?: boolean;
  clinicalSignificance: string;
  regexPattern: RegExp;
}

export interface DiseaseDefinition {
  id: string;
  name: string;
  alternativeNames?: string[];
  icd11: ICD11Reference;
  category: DiseaseCategory;
  specialty: string;
  department: string;
  description: string;
  /** Hallmark or pathognomonic symptoms for this condition */
  coreSymptoms: string[];
  /** Secondary or commonly accompanying symptoms */
  associatedSymptoms: string[];
  /** Cancer warning signs relevant to this neoplasm, if applicable */
  cancerWarningSigns?: string[];
  urgency: "emergency" | "urgent" | "routine";
  /** Evidence-based next clinical steps (labs, imaging, biopsy, consult) */
  nextSteps: string;
  /** Flag for malignancies requiring definitive tissue/imaging evaluation */
  requiresBiopsyOrImaging?: boolean;
  sources: MedicalSource[];
}

export interface MatchedDiseaseResult {
  disease: DiseaseDefinition;
  /** Relative match score (bounded 15% to 98% to prevent false certainty) */
  matchScore: number;
  matchedCoreSymptoms: string[];
  matchedAssociatedSymptoms: string[];
  /** Classic symptoms that the patient has NOT reported */
  missingClassicSymptoms: string[];
  /** Red-flag cancer signs present in input */
  activeCancerWarnings: string[];
  urgency: "emergency" | "urgent" | "routine";
  clinicalRecommendation: string;
  cancerSafetyDisclaimer?: string;
}

export interface EmergencyEvaluation {
  isEmergency: boolean;
  reasons: string[];
  actionPlan: string;
}

export interface MultiSymptomDiagnosisReport {
  extractedSymptoms: {
    id: string;
    name: string;
    text: string;
    negated: boolean;
    duration?: string;
    severity?: "mild" | "moderate" | "severe";
  }[];
  negatedSymptoms: string[];
  emergencyEvaluation: EmergencyEvaluation;
  cancerWarningFlagsDetected: {
    symptomId: string;
    warningName: string;
    advice: string;
  }[];
  possibleConditions: MatchedDiseaseResult[];
  suggestedDepartment: string;
  alternativeDepartments: string[];
  explanation: string;
  disclaimer: string;
  kbMetadata: {
    totalDiseases: number;
    totalSymptoms: number;
    icd11Standard: string;
    version: string;
    sources: MedicalSource[];
  };
}
