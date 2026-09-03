/**
 * T12 — `Statement`, `Disclosure`, Bucket-Tabelle und `entails`.
 *
 * Hier steht die Rechnung, die aus der Truthfulness-Regel eine pruefbare
 * Funktion macht (Doc 08 §8.2.2 R3): **die Behauptung muss den geglaubten Wert
 * enthalten**. Nicht ihn treffen — enthalten. "Ich habe Geld" ist bei 100
 * Muenzen wahr, "ich habe fast kein Geld" nicht, obwohl beide Saetze dieselbe
 * Zahl meinen.
 */

import type {
  Bucket,
  BucketTable,
  BucketThresholds,
  Disclosure,
  InfoId,
  InfoItem,
  InfoTopic,
  InfoValue,
  Statement,
  StatementKind,
} from '../core/types.js';

/** Grenzen fuer ein Thema; die genauere Angabe (`topic:detail`) gewinnt. */
export function bucketThresholdsFor(
  buckets: Readonly<BucketTable>,
  topic: InfoTopic,
  detail?: string,
): BucketThresholds {
  const specific = detail ? buckets[`${topic}:${detail}`] : undefined;
  const generic = buckets[topic];
  const found = specific ?? generic;
  if (!found) {
    throw new Error(`Keine Bucket-Grenzen fuer ${topic}${detail ? `:${detail}` : ''}`);
  }
  return found;
}

export function bucketOf(value: number, thresholds: Readonly<BucketThresholds>): Bucket {
  if (value < thresholds.some) return 'none';
  if (value < thresholds.much) return 'some';
  return 'much';
}

/**
 * Doc 08 §8.2.2 R3 — enthaelt die Aussage den geglaubten Wert?
 *
 * Nicht-numerische Ueberzeugungen (`boolean`, `string`) kommen bei
 * `event_occurred` und spaeter bei `agent_alliance` vor. Fuer sie ergeben
 * `bound` und `qualitative` keinen Sinn; dort zaehlt nur Gleichheit
 * beziehungsweise Existenz.
 */
export function entails(
  disclosure: Readonly<Disclosure>,
  believed: InfoValue,
  thresholds: Readonly<BucketThresholds>,
): boolean {
  switch (disclosure.mode) {
    case 'exact':
      return disclosure.value === believed;

    case 'bound':
      if (typeof believed !== 'number') return false;
      return disclosure.op === '>=' ? believed >= disclosure.value : believed <= disclosure.value;

    case 'qualitative':
      if (typeof believed !== 'number') return false;
      return bucketOf(believed, thresholds) === disclosure.bucket;

    case 'existence_only':
      return meansPresence(believed);
  }
}

/**
 * T18 — Umkehrung von `entails`: welchen Wert nimmt an, wer eine Disclosure
 * hoert und daraus einen eigenen `KnowledgeEntry` macht (`share_information`,
 * `request_information`)?
 *
 * Es gibt keine einzige richtige Antwort — eine Disclosure laesst absichtlich
 * einen Bereich offen ("etwas Nahrung" kann 6 oder 19 sein). Die Regel hier ist
 * die **konservativste** Zahl, die die Aussage noch erfuellt: fuer `bound`/
 * `exact` der genannte Wert selbst, fuer `qualitative` die UNTERE Grenze des
 * Buckets, fuer `existence_only` die kleinste positive Zahl. Wer daraus spaeter
 * selbst `hearsay` aeussert, behauptet damit nie mehr, als er gehoert hat — per
 * Konstruktion gilt `entails(disclosure, impliedValue(disclosure, ...), ...)`.
 *
 * `valueType` entscheidet nur bei `existence_only`, wo die Disclosure selbst
 * keine Zahl enthaelt: bei allem ausser `'quantity'` ist "es gibt etwas"
 * schlicht `true`.
 */
export function impliedValue(
  disclosure: Readonly<Disclosure>,
  thresholds: Readonly<BucketThresholds>,
  valueType: InfoItem['valueType'],
): InfoValue {
  switch (disclosure.mode) {
    case 'exact':
      return disclosure.value;

    case 'bound':
      return disclosure.value;

    case 'qualitative':
      switch (disclosure.bucket) {
        case 'none':
          // Voraussetzt, dass der Wertebereich bei 0 beginnt (Doc 03 §3.2.2:
          // Resources sind Integer >= 0) — fuer jedes bisher konfigurierte
          // Thema der Fall.
          return 0;
        case 'some':
          return thresholds.some;
        case 'much':
          return thresholds.much;
      }
      break;

    case 'existence_only':
      return valueType === 'quantity' ? 1 : true;
  }
}

/** "Es gibt etwas" — die schwaechste positive Aussage. */
export function meansPresence(value: InfoValue): boolean {
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'boolean') return value;
  return value.length > 0;
}

/** Gegenstueck: was `assert_absence` behauptet (Doc 08 §8.2.2 R4). */
export function meansAbsence(value: InfoValue): boolean {
  return !meansPresence(value);
}

// ── Zugriff auf die Bestandteile einer Aussage ───────────────────────────────

/** Auf welche Info bezieht sich die Aussage — oder auf keine. */
export function statementInfoId(statement: Readonly<Statement>): InfoId | null {
  switch (statement.kind) {
    case 'assert_fact':
    case 'assert_absence':
    case 'belief':
    case 'hearsay':
    case 'partial_disclosure':
      return statement.infoId;
    default:
      return null;
  }
}

export function statementDisclosure(statement: Readonly<Statement>): Disclosure | null {
  return 'disclosure' in statement ? statement.disclosure : null;
}

/** Die vier Verweigerungsformen plus `none` — Aussagen, die nichts behaupten. */
export type RefusalStatement = Extract<
  Statement,
  { kind: 'refuse_to_answer' | 'withhold' | 'redirect_conversation' | 'express_uncertainty' | 'none' }
>;

/**
 * Doc 08 §8.2.2 R9 — Verweigerung ist immer legal.
 *
 * Diese vier Formen kosten nichts ausser sozialen Folgen. Sie sind der Ausweg,
 * den die Regel jedem Agenten laesst: wer nicht luegen darf, muss schweigen
 * duerfen.
 */
export function isRefusal(statement: Statement): statement is RefusalStatement {
  return (
    statement.kind === 'refuse_to_answer' ||
    statement.kind === 'withhold' ||
    statement.kind === 'redirect_conversation' ||
    statement.kind === 'express_uncertainty' ||
    statement.kind === 'none'
  );
}

/** Detailschluessel fuer die Bucket-Suche, z. B. `coins` aus `info_res_agent_003_coins`. */
export function bucketDetailOf(item: Readonly<InfoItem>, infoId: InfoId): string | undefined {
  if (item.topic !== 'agent_resource' && item.topic !== 'stock_at_location') return undefined;
  const parts = infoId.split('_');
  return parts.at(-1);
}

// ── R7: schliessen sich zwei Aussagen gegenseitig aus? ───────────────────────

/**
 * Der Wertebereich, den eine Aussage zulaesst.
 *
 * `lo`/`hi` sind Zahlenschranken, `loOpen`/`hiOpen` sagen, ob die Schranke
 * selbst noch dazugehoert. Ein Bucket `none` ist `(-∞, some)` — offen, weil die
 * Grenze zum naechsten Bucket gehoert. Ohne diese Unterscheidung waeren `none`
 * und `some` bei `some = 1` faelschlich ueberlappend, und R7 fiele still aus.
 */
interface ClaimRange {
  lo: number;
  hi: number;
  loOpen: boolean;
  hiOpen: boolean;
}

export type Claim =
  | { k: 'range'; range: ClaimRange }
  /** nicht-numerische Gleichheit (`boolean`, `string`) */
  | { k: 'equals'; value: InfoValue }
  /** "da ist etwas" ohne Zahl */
  | { k: 'present' }
  /** "da ist nichts" */
  | { k: 'absent' }
  /** keine Tatsachenbehauptung — kann nichts widersprechen */
  | { k: 'silent' };

const OPEN_RANGE: ClaimRange = {
  lo: Number.NEGATIVE_INFINITY,
  hi: Number.POSITIVE_INFINITY,
  loOpen: false,
  hiOpen: false,
};

function bucketRange(bucket: Bucket, thresholds: Readonly<BucketThresholds>): ClaimRange {
  switch (bucket) {
    case 'none':
      return { ...OPEN_RANGE, hi: thresholds.some, hiOpen: true };
    case 'some':
      return { lo: thresholds.some, hi: thresholds.much, loOpen: false, hiOpen: true };
    case 'much':
      return { ...OPEN_RANGE, lo: thresholds.much, loOpen: false };
  }
}

function disclosureClaim(
  disclosure: Readonly<Disclosure>,
  thresholds: Readonly<BucketThresholds>,
): Claim {
  switch (disclosure.mode) {
    case 'exact':
      return typeof disclosure.value === 'number'
        ? { k: 'range', range: { lo: disclosure.value, hi: disclosure.value, loOpen: false, hiOpen: false } }
        : { k: 'equals', value: disclosure.value };
    case 'bound':
      return disclosure.op === '>='
        ? { k: 'range', range: { ...OPEN_RANGE, lo: disclosure.value } }
        : { k: 'range', range: { ...OPEN_RANGE, hi: disclosure.value } };
    case 'qualitative':
      return { k: 'range', range: bucketRange(disclosure.bucket, thresholds) };
    case 'existence_only':
      return { k: 'present' };
  }
}

/** Was eine Aussage ueber den Wert behauptet — `silent`, wenn sie nichts behauptet. */
export function claimOf(
  kind: StatementKind,
  disclosure: Readonly<Disclosure> | null | undefined,
  thresholds: Readonly<BucketThresholds>,
): Claim {
  if (kind === 'assert_absence') return { k: 'absent' };
  if (!disclosure) return { k: 'silent' };
  return disclosureClaim(disclosure, thresholds);
}

/**
 * Doc 08 §8.2.2 R7 — schliessen sich zwei Behauptungen ueber denselben Wert aus?
 *
 * Ueberschneiden sich die zugelassenen Wertebereiche in keinem einzigen Punkt,
 * koennen nicht beide gemeint sein. Bei `present`/`absent` reicht der Sinn:
 * "da ist etwas" und "da ist nichts" vertragen sich nie.
 */
export function claimsContradict(a: Claim, b: Claim): boolean {
  if (a.k === 'silent' || b.k === 'silent') return false;

  const left = numeric(a);
  const right = numeric(b);
  if (left && right) return !overlaps(left, right);

  if (a.k === 'equals' && b.k === 'equals') return a.value !== b.value;
  if (a.k === 'equals') return contradictsValue(a.value, b);
  if (b.k === 'equals') return contradictsValue(b.value, a);

  // Bleiben nur noch die Faelle, die `numeric` nicht abdeckt.
  return false;
}

/** `present`/`absent` als Zahlenbereich, damit sie mit Buckets vergleichbar sind. */
function numeric(claim: Claim): ClaimRange | null {
  if (claim.k === 'range') return claim.range;
  if (claim.k === 'present') return { ...OPEN_RANGE, lo: 0, loOpen: true };
  if (claim.k === 'absent') return { ...OPEN_RANGE, hi: 0, hiOpen: false };
  return null;
}

function contradictsValue(value: InfoValue, other: Claim): boolean {
  if (other.k === 'present') return meansAbsence(value);
  if (other.k === 'absent') return meansPresence(value);
  return false;
}

function overlaps(a: ClaimRange, b: ClaimRange): boolean {
  const lo = Math.max(a.lo, b.lo);
  const loOpen = a.lo === b.lo ? a.loOpen || b.loOpen : a.lo > b.lo ? a.loOpen : b.loOpen;
  const hi = Math.min(a.hi, b.hi);
  const hiOpen = a.hi === b.hi ? a.hiOpen || b.hiOpen : a.hi < b.hi ? a.hiOpen : b.hiOpen;

  if (lo < hi) return true;
  return lo === hi && !loOpen && !hiOpen;
}
