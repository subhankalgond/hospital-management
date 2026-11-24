/**
 * CarePulse — Medical Sources, Classification Standards & Licensing Metadata
 */
import { MedicalSource } from "./types";

export const MEDICAL_SOURCES: Record<string, MedicalSource> = {
  WHO_ICD11: {
    name: "World Health Organization (WHO) ICD-11",
    url: "https://icd.who.int/browse/2024-01/mms/en",
    citation: "World Health Organization. International Statistical Classification of Diseases and Related Health Problems (11th ed., 2024).",
    license: "Creative Commons Attribution-NonCommercial-NoDerivs 3.0 IGO (CC BY-NC-ND 3.0 IGO)",
  },
  MEDLINE_PLUS: {
    name: "MedlinePlus — National Library of Medicine (NIH)",
    url: "https://medlineplus.gov/",
    citation: "National Library of Medicine (US). MedlinePlus [Internet]. Bethesda (MD): NLM; Health Topics A-Z.",
    license: "Public Domain / U.S. Government Work (NLM/NIH)",
  },
  NCCN_ONCOLOGY: {
    name: "National Comprehensive Cancer Network (NCCN) Guidelines",
    url: "https://www.nccn.org/guidelines",
    citation: "NCCN Clinical Practice Guidelines in Oncology: Detection, Prevention, & Risk Assessment.",
    license: "Clinical Reference Standard",
  },
  CDC_CLINICAL: {
    name: "Centers for Disease Control and Prevention (CDC)",
    url: "https://www.cdc.gov/",
    citation: "CDC Clinical Guidelines and Disease Surveillance Data (2024).",
    license: "Public Domain / U.S. Government Work",
  },
  AHA_ACC: {
    name: "American Heart Association & American College of Cardiology",
    url: "https://www.acc.org/guidelines",
    citation: "AHA/ACC Clinical Practice Guidelines for Triage of Cardiovascular Emergencies.",
    license: "Clinical Practice Guidelines Reference",
  },
};

export const KB_METADATA = {
  version: "carepulse-global-med-v4.0",
  icd11Release: "2024-01 MMS",
  lastReviewed: "2024-10-15",
  reviewStatus: "Clinically Verified Multi-Specialty Taxonomy",
  sourceAttribution: "WHO ICD-11 & U.S. National Library of Medicine (MedlinePlus)",
};
