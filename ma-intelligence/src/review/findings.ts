/**
 * Das maschinenlesbare Findings-Format und das Einlesen einer Reviewer-Antwort.
 *
 * Eine KI-Antwort ist unvertrauenswuerdige Eingabe. Sie kann abgeschnitten
 * sein, in Markdown eingewickelt, mit erfundenen Kategorien versehen oder auf
 * Dateien ausserhalb des Repositorys zeigen. Deshalb wirft hier nichts —
 * `parseReviewResponse` liefert immer ein Ergebnis, das der Loop verarbeiten
 * kann, notfalls "unbrauchbar".
 */

import { z } from 'zod';

import { FINDING_CATEGORIES, MIN_ACTIONABLE_CONFIDENCE, SEVERITIES, SEVERITY_ORDER } from './contract.js';

/** `ARCH-001` — Praefix aus Grossbuchstaben, dreistellige Nummer. */
export const findingIdSchema = z
  .string()
  .regex(/^[A-Z]{2,8}-\d{3}$/, 'finding_id hat die Form ARCH-001');

/**
 * Repository-relativer Pfad. Absolute Pfade und `..` werden abgewiesen: ein
 * Finding darf nur auf Dateien dieses Repositorys zeigen, sonst laesst sich
 * ueber den Fix-Agenten auf Dateien ausserhalb zeigen.
 */
export const findingPathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith('/'), 'Pfad muss repository-relativ sein')
  .refine((value) => !value.includes('..'), 'Pfad darf nicht aus dem Repository herausfuehren')
  .refine((value) => !value.includes('\\'), 'Pfadtrenner ist "/"');

/** `"20-35"` oder `"20"`. Bei einem Bereich muss das Ende hinter dem Anfang liegen. */
export const findingLinesSchema = z
  .string()
  .regex(/^\d+(?:-\d+)?$/, 'lines ist "20" oder "20-35"')
  .refine((value) => {
    const [start, end] = value.split('-');
    if (end === undefined) return Number(start) >= 1;
    return Number(start) >= 1 && Number(end) >= Number(start);
  }, 'Zeilenbereich ist leer oder rueckwaerts');

export const findingSchema = z
  .object({
    finding_id: findingIdSchema,
    severity: z.enum(SEVERITIES),
    category: z.enum(FINDING_CATEGORIES),
    file: findingPathSchema,
    lines: findingLinesSchema,
    /** Was falsch ist. */
    problem: z.string().trim().min(10, 'problem muss das Problem benennen'),
    /** Woran man es im Code sieht — ohne Beleg ist es eine Behauptung. */
    evidence: z.string().trim().min(10, 'evidence muss den Befund belegen'),
    /** Was konkret geaendert werden soll. */
    required_change: z.string().trim().min(10, 'required_change muss konkret sein'),
    /** Woran der Fix gemessen wird. Mindestens ein pruefbares Kriterium. */
    acceptance_criteria: z.array(z.string().trim().min(5)).min(1, 'mindestens ein Akzeptanzkriterium'),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type Finding = z.infer<typeof findingSchema>;

/** Die Antwort eines Reviewers: eine Liste von Findings, sonst nichts. */
export const reviewResponseSchema = z
  .object({
    contract_version: z.string().min(1),
    findings: z.array(findingSchema),
  })
  .strict();

export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

export type ParsedReview =
  | { status: 'ok'; response: ReviewResponse }
  | { status: 'unusable'; error: string; raw_excerpt: string };

const RAW_EXCERPT_LENGTH = 400;

function excerpt(raw: string): string {
  return raw.length <= RAW_EXCERPT_LENGTH ? raw : `${raw.slice(0, RAW_EXCERPT_LENGTH)}…`;
}

/**
 * Entfernt einen Markdown-Codezaun, falls das Modell einen darum gelegt hat.
 * Das ist die einzige zugestandene Nachsicht — alles andere muss stimmen.
 */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const withoutOpening = trimmed.replace(/^```[a-zA-Z]*\n?/, '');
  const closing = withoutOpening.lastIndexOf('```');
  return closing === -1 ? withoutOpening.trim() : withoutOpening.slice(0, closing).trim();
}

/**
 * Liest eine rohe Reviewer-Antwort ein.
 *
 * Wirft nie. Eine kaputte Antwort ist ein Zustand des Loops, kein Absturz —
 * sonst haengt der Workflow an der Laune eines Modells.
 */
export function parseReviewResponse(raw: string): ParsedReview {
  if (raw.trim() === '') {
    return { status: 'unusable', error: 'Leere Antwort', raw_excerpt: '' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch (error) {
    return {
      status: 'unusable',
      error: `Antwort ist kein JSON: ${error instanceof Error ? error.message : String(error)}`,
      raw_excerpt: excerpt(raw),
    };
  }

  const result = reviewResponseSchema.safeParse(parsed);
  if (!result.success) {
    return {
      status: 'unusable',
      error: `Antwort verletzt den Review-Contract: ${result.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ')}`,
      raw_excerpt: excerpt(raw),
    };
  }

  const duplicate = firstDuplicateId(result.data.findings);
  if (duplicate !== null) {
    return {
      status: 'unusable',
      error: `finding_id ${duplicate} kommt mehrfach vor — Findings muessen eindeutig adressierbar sein`,
      raw_excerpt: excerpt(raw),
    };
  }

  return { status: 'ok', response: result.data };
}

function firstDuplicateId(findings: readonly Finding[]): string | null {
  const seen = new Set<string>();
  for (const finding of findings) {
    if (seen.has(finding.finding_id)) return finding.finding_id;
    seen.add(finding.finding_id);
  }
  return null;
}

/** CRITICAL zuerst, bei gleichem Schweregrad nach ID — stabil und vorhersagbar. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((left, right) => {
    const bySeverity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    return bySeverity !== 0 ? bySeverity : left.finding_id.localeCompare(right.finding_id);
  });
}

/**
 * Ein Finding, dem der Reviewer selbst nicht traut, wird nicht automatisch
 * umgesetzt. Es geht an die menschliche Triage — und verschwindet nicht.
 */
export function requiresHumanTriage(finding: Finding): boolean {
  return finding.confidence < MIN_ACTIONABLE_CONFIDENCE;
}

export function partitionFindings(findings: readonly Finding[]): {
  actionable: Finding[];
  needs_human_triage: Finding[];
} {
  const sorted = sortFindings(findings);
  return {
    actionable: sorted.filter((finding) => !requiresHumanTriage(finding)),
    needs_human_triage: sorted.filter(requiresHumanTriage),
  };
}
