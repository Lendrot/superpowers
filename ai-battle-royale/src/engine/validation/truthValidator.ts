/**
 * T13 — der Truth-Validator. Doc 08 §8.2.
 *
 * Der Grundsatz aus §8.2.1, und alles Weitere folgt daraus:
 *
 *   > Geprueft wird gegen den Wissensstand des Agenten, nicht gegen die
 *   > Weltwahrheit.
 *
 * Ein Agent mit veralteter Ueberzeugung darf sie aussprechen — das ist ein
 * Irrtum. Wer etwas sagt, das seinem *eigenen* `KnowledgeEntry` widerspricht,
 * luegt. Deshalb liest diese Datei nie `resolveTrueValue`; sie kennt die
 * Weltwahrheit nicht einmal, und das ist keine Nachlaessigkeit, sondern die
 * Regel selbst.
 *
 * Bewusste Abweichungen von §8.2.3:
 *
 * 1. Der Kontext traegt zusaetzlich `infoRegistry`. Ohne das `InfoItem` gibt es
 *    weder Volatilitaet (also keinen Sicherheitsverfall) noch Thema (also keine
 *    Bucket-Grenzen). Die Signatur der Spec kann R2 und R3 nicht ausrechnen.
 * 2. **R7 wird vor R3 geprueft.** Die Testtabelle in §8.3 erwartet fuer
 *    "sagte gestern `much`, Wissen unveraendert, sagt heute `none`" den Grund
 *    `self_contradiction` — obwohl R3 denselben Fall als `false_assertion`
 *    faenge. §8.2.2 nummeriert die Regeln nur, eine Auswertungsreihenfolge legt
 *    erst §8.1 fest, und zwar fuer die Stufen der Kette, nicht fuer die Regeln
 *    darin. Der Selbstwiderspruch ist die genauere Diagnose: er benennt, dass
 *    zwei Aussagen nicht zusammenpassen, waehrend `false_assertion` nur sagt,
 *    dass eine davon falsch ist.
 */

import {
  bucketDetailOf,
  bucketThresholdsFor,
  claimOf,
  claimsContradict,
  entails,
  isRefusal,
  meansAbsence,
  statementDisclosure,
  statementInfoId,
} from '../information/statements.js';
import { effectiveCertainty } from '../information/knowledge.js';
import { lastStatement } from '../information/statementLog.js';
import type {
  Agent,
  BucketThresholds,
  Disclosure,
  InfoRegistry,
  KnowledgeEntry,
  MatchConfig,
  Round,
  Statement,
  StatementKind,
  StatementLog,
  TruthRejectReason,
} from '../core/types.js';

export interface TruthContext {
  round: Round;
  config: Readonly<MatchConfig>;
  statementLog: Readonly<StatementLog>;
  infoRegistry: Readonly<InfoRegistry>;
}

export type TruthResult =
  | { ok: true }
  | { ok: false; reason: TruthRejectReason; detail: string; suggestion?: Statement };

/**
 * Doc 08 §8.2.3. `suggestion` ist die naechstschwaechere legale Variante
 * (`assert_fact` → `belief` → `express_uncertainty`), damit die Pipeline ohne
 * zweiten LLM-Aufruf reparieren kann.
 */
export function validateStatement(
  statement: Statement,
  actor: Readonly<Agent>,
  ctx: TruthContext,
): TruthResult {
  return check(statement, actor, ctx, true);
}

function check(
  statement: Statement,
  actor: Readonly<Agent>,
  ctx: TruthContext,
  withSuggestion: boolean,
): TruthResult {
  // R9 — Verweigerung ist ausnahmslos zulaessig, unabhaengig vom Wissensstand.
  // R8 — eine Absichtserklaerung ist erst im Nachhinein wahr oder falsch; ein
  // gebrochenes Versprechen ist Verrat, kein Validierungsfehler.
  if (isRefusal(statement) || statement.kind === 'declare_intent') {
    return { ok: true };
  }

  // R1 — Wissensdeckung.
  const infoId = statementInfoId(statement);
  if (!infoId) {
    return fail(statement, actor, ctx, 'unknown_reference', 'Aussage ohne Infobezug', withSuggestion);
  }
  const item = ctx.infoRegistry[infoId];
  const entry = actor.knowledge[infoId];
  if (!item || !entry) {
    return fail(
      statement,
      actor,
      ctx,
      'unknown_reference',
      `${actor.id} weiss nichts ueber ${infoId}`,
      withSuggestion,
    );
  }

  const thresholds = bucketThresholdsFor(
    ctx.config.buckets,
    item.topic,
    bucketDetailOf(item, infoId),
  );

  // R7 — Konsistenz mit frueheren eigenen Aussagen. Vor R3, siehe Kopfkommentar.
  const contradiction = selfContradiction(statement, actor, ctx, entry, thresholds);
  if (contradiction) {
    return fail(statement, actor, ctx, 'self_contradiction', contradiction, withSuggestion);
  }

  const certainty = effectiveCertainty(entry, item, ctx.round, ctx.config.info);
  const threshold = ctx.config.info.assertCertaintyThreshold;

  switch (statement.kind) {
    case 'assert_fact': {
      // R2 (Sicherheit + eigene Wahrnehmung) und R6 (Inferiertes ist nie Fakt).
      if (entry.source === 'told_by' || entry.source === 'inferred') {
        return fail(
          statement,
          actor,
          ctx,
          'unsupported_certainty',
          `Wissen aus '${entry.source}' kann keine Tatsache sein (R2/R6)`,
          withSuggestion,
        );
      }
      if (certainty < threshold) {
        return fail(
          statement,
          actor,
          ctx,
          'unsupported_certainty',
          `Sicherheit ${round2(certainty)} < ${threshold}`,
          withSuggestion,
        );
      }
      return entailmentCheck(statement, actor, ctx, entry, thresholds, withSuggestion);
    }

    case 'assert_absence': {
      // R4 — keine Behauptung aus Unwissenheit. Wer nichts weiss, hat auch
      // keinen Grund zu sagen, dass dort nichts ist.
      if (!meansAbsence(entry.believedValue)) {
        return fail(
          statement,
          actor,
          ctx,
          'false_assertion',
          `${actor.id} glaubt ${JSON.stringify(entry.believedValue)} — das ist keine Abwesenheit`,
          withSuggestion,
        );
      }
      if (certainty < threshold) {
        return fail(
          statement,
          actor,
          ctx,
          'unsupported_certainty',
          `Abwesenheit behaupten verlangt Sicherheit >= ${threshold}, war ${round2(certainty)}`,
          withSuggestion,
        );
      }
      return { ok: true };
    }

    case 'hearsay': {
      // R5 — Hoerensagen muss attribuiert sein, und zwar korrekt.
      if (entry.source !== 'told_by' || entry.sourceAgent !== statement.sourceAgent) {
        return fail(
          statement,
          actor,
          ctx,
          'unattributed_hearsay',
          `Quelle laut Wissen: ${entry.source}${entry.sourceAgent ? `/${entry.sourceAgent}` : ''}, ` +
            `laut Aussage: ${statement.sourceAgent}`,
          withSuggestion,
        );
      }
      return entailmentCheck(statement, actor, ctx, entry, thresholds, withSuggestion);
    }

    case 'belief':
    case 'partial_disclosure':
      // R3 allein. Beide Formen markieren die Unsicherheit bereits selbst, also
      // gibt es nichts zu decken — nur nichts Falsches zu sagen.
      return entailmentCheck(statement, actor, ctx, entry, thresholds, withSuggestion);
  }
}

/** R3 — Entailment: die Behauptung muss den geglaubten Wert enthalten. */
function entailmentCheck(
  statement: Readonly<Statement>,
  actor: Readonly<Agent>,
  ctx: TruthContext,
  entry: Readonly<KnowledgeEntry>,
  thresholds: Readonly<BucketThresholds>,
  withSuggestion: boolean,
): TruthResult {
  const disclosure = statementDisclosure(statement);
  if (!disclosure) return { ok: true };
  if (entails(disclosure, entry.believedValue, thresholds)) return { ok: true };
  return fail(
    statement,
    actor,
    ctx,
    'false_assertion',
    `Aussage ${JSON.stringify(disclosure)} enthaelt den geglaubten Wert ` +
      `${JSON.stringify(entry.believedValue)} nicht (R3)`,
    withSuggestion,
  );
}

/**
 * R7 — zwei einander ausschliessende Behauptungen zu derselben Info, ohne dass
 * sich der geglaubte Wert dazwischen geaendert hat.
 *
 * Hat er sich geaendert, ist die neue Aussage zulaessig; ein Zuhoerer, der
 * beides gehoert hat, darf misstrauisch werden (das ist Spielmechanik, keine
 * Validierung).
 */
function selfContradiction(
  statement: Readonly<Statement>,
  actor: Readonly<Agent>,
  ctx: TruthContext,
  entry: Readonly<KnowledgeEntry>,
  thresholds: Readonly<BucketThresholds>,
): string | null {
  const infoId = statementInfoId(statement);
  if (!infoId) return null;

  const previous = lastStatement(ctx.statementLog, actor.id, infoId);
  if (!previous) return null;
  if (previous.believedValueAtTime !== entry.believedValue) return null;

  const before = claimOf(previous.kind, previous.disclosure, thresholds);
  const now = claimOf(statement.kind, statementDisclosure(statement), thresholds);
  if (!claimsContradict(before, now)) return null;

  return (
    `Runde ${previous.round} sagte ${actor.id} ${describe(previous.kind, previous.disclosure)}, ` +
    `jetzt ${describe(statement.kind, statementDisclosure(statement))} — Wissen unveraendert`
  );
}

/**
 * Die naechstschwaechere Variante, die tatsaechlich durchgeht.
 *
 * Nicht geraten, sondern durchgerechnet: jeder Vorschlag laeuft selbst durch
 * `check`. Ein Vorschlag, der wieder abgelehnt wuerde, waere schlimmer als
 * keiner — die Pipeline haette dann zwei Fehlschlaege statt einem.
 */
function suggest(
  statement: Readonly<Statement>,
  actor: Readonly<Agent>,
  ctx: TruthContext,
): Statement | undefined {
  const infoId = statementInfoId(statement);
  const item = infoId ? ctx.infoRegistry[infoId] : undefined;
  const disclosure = statementDisclosure(statement);
  const candidates: Statement[] = [];

  if (infoId && disclosure && statement.kind !== 'belief') {
    const entry = actor.knowledge[infoId];
    if (entry?.source === 'told_by' && entry.sourceAgent && statement.kind !== 'hearsay') {
      candidates.push({ kind: 'hearsay', infoId, sourceAgent: entry.sourceAgent, disclosure });
    }
    candidates.push({ kind: 'belief', infoId, hedge: 'not_sure', disclosure });
  }
  if (item) {
    candidates.push({ kind: 'express_uncertainty', topic: item.topic });
  }

  return candidates.find((candidate) => check(candidate, actor, ctx, false).ok);
}

function fail(
  statement: Readonly<Statement>,
  actor: Readonly<Agent>,
  ctx: TruthContext,
  reason: TruthRejectReason,
  detail: string,
  withSuggestion: boolean,
): TruthResult {
  if (!withSuggestion) return { ok: false, reason, detail };
  const suggestion = suggest(statement, actor, ctx);
  return suggestion ? { ok: false, reason, detail, suggestion } : { ok: false, reason, detail };
}

function describe(kind: StatementKind, disclosure: Readonly<Disclosure> | null | undefined): string {
  return `${kind}(${JSON.stringify(disclosure ?? null)})`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
