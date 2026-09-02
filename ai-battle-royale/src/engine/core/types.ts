/**
 * Doc 03 — Data Model, reduziert auf den deterministischen Kern (T02 reduziert).
 *
 * Enthalten sind nur die Entities, die Schritt 1 braucht: WorldState, Agent,
 * Location, WorldEvent, Effect. Information, Statements, Beziehungen, Allianzen,
 * Pledges, Memory und Lessons folgen in Tag 2–5 und sind hier bewusst NICHT als
 * leere Platzhalter vorhanden — ein Feld, das nichts tut, ist eine Behauptung
 * ueber Funktionalitaet, die es nicht gibt.
 */

// ── 3.0 Grundtypen ───────────────────────────────────────────────────────────

export type AgentId = `agent_${string}`;
export type AllianceId = `alliance_${string}`;
export type MatchId = `match_${string}`;
export type EventId = `event_${string}`;

export type LocationId =
  | 'commons'
  | 'warehouse'
  | 'fields'
  | 'workshop'
  | 'outskirts'
  | 'well';

/** 1-basiert. Runde 0 existiert nicht; die Startwelt steht "vor" Runde 1. */
export type Round = number;
/** 0..1 */
export type Score01 = number;
/** 0..100, Integer */
export type Stat = number;

export type ResourceKind = 'food' | 'coins' | 'materials';

export interface Resources {
  food: number;
  coins: number;
  materials: number;
}

export interface Needs {
  satiety: Stat;
  energy: Stat;
}

// ── 3.2.1 Personality ────────────────────────────────────────────────────────

export interface Personality {
  ambition: Stat;
  loyalty: Stat;
  honesty: Stat;
  empathy: Stat;
  riskTaking: Stat;
  intelligence: Stat;
  sociability: Stat;
  manipulation: Stat;
  dominance: Stat;
}

export const PERSONALITY_TRAITS = [
  'ambition',
  'loyalty',
  'honesty',
  'empathy',
  'riskTaking',
  'intelligence',
  'sociability',
  'manipulation',
  'dominance',
] as const satisfies readonly (keyof Personality)[];

// ── 3.2.2 Status ─────────────────────────────────────────────────────────────

export interface StatusFlags {
  /** Runden mit satiety === 0 */
  hungerStreak: number;
  /** Runden mit energy === 0 */
  exhaustionStreak: number;
  exiledFrom: AllianceId[];
}

export type EliminationCause = 'starvation' | 'exhaustion' | 'exile';

// ── 4.1 Aktionen ─────────────────────────────────────────────────────────────

/**
 * Die vollstaendige Action-Library v1 aus Doc 04 §4.1 als geschlossener Typ.
 * Implementiert (registry.ts) sind in Schritt 1 nur `rest` und `gather_resource`.
 *
 * Doc 04 §4.2 / CLAUDE.md Regel 5: die vier Aktionen, mit denen ein Agent
 * bewusst falsche Aussagen erzeugen koennte, existieren nicht — weder hier noch
 * sonst im Quelltext. Welche das sind, steht in Doc 04 §4.2 und in
 * `tests/unit/noLieActions.test.ts`; dieser Test durchsucht `src/` nach genau
 * diesen Zeichenketten, weshalb sie hier absichtlich nicht wiederholt werden.
 */
export type ActionType =
  | 'gather_resource'
  | 'rest'
  | 'move'
  | 'consume'
  | 'trade'
  | 'share_information'
  | 'request_information'
  | 'offer_alliance'
  | 'leave_alliance'
  | 'expel_member'
  | 'help'
  | 'investigate'
  | 'confront';

export type ActionTier = 'routine' | 'social' | 'strategic';

// ── 3.2 Agent ────────────────────────────────────────────────────────────────

export interface Agent {
  id: AgentId;
  name: string;
  /** Stabiler Archetyp-Schluessel — Grundlage der Gewinnverteilungs-Statistik. */
  archetype: ArchetypeId;
  alive: boolean;
  eliminatedRound?: Round;
  eliminationCause?: EliminationCause;
  location: LocationId;

  /** konstant ueber das Match */
  personality: Personality;
  needs: Needs;
  resources: Resources;
  status: StatusFlags;

  /** was DIESER Agent glaubt — entsteht ausschliesslich in Phase 2 (Doc 02 §2.3) */
  knowledge: Record<InfoId, KnowledgeEntry>;

  /** frueheste naechste Runde je Aktionstyp; fehlender Eintrag = kein Cooldown */
  cooldowns: Partial<Record<ActionType, Round>>;
  allianceId: AllianceId | null;
}

export type ArchetypeId =
  | 'striver'
  | 'loyalist'
  | 'opportunist'
  | 'recluse'
  | 'connector';

// ── 3.4 Informationssystem ───────────────────────────────────────────────────

export type InfoId = `info_${string}`;

export type InfoTopic =
  /** wieviel Food/Materials an Ort X liegen */
  | 'stock_at_location'
  /** wieviel Y Agent Z besitzt */
  | 'agent_resource'
  /** in welcher Allianz Z ist */
  | 'agent_alliance'
  /** Z's geheimes Ziel */
  | 'agent_secret_goal'
  /** ob Zusage P erfuellt/gebrochen wurde */
  | 'pledge_state'
  /** Ereignis E ist passiert */
  | 'event_occurred'
  /** Z hat oeffentlich Absicht I erklaert */
  | 'agent_intent_declared';

export type InfoValue = number | boolean | string;

/**
 * Doc 03 §3.4.1 — die objektive Wahrheit im Registry.
 *
 * Abweichung, bewusst: Doc fuehrt hier ein Feld `trueValue`. Das waere eine
 * zweite Kopie derselben Wahrheit (der Bestand steht bereits in
 * `Location.stock`), die bei jeder Mutation mitgepflegt werden muesste und
 * zwangslaeufig auseinanderlaeuft — genau die Begruendung, mit der Doc 06 §6.1
 * den dritten Speicher gestrichen hat. Stattdessen loest
 * `information/infoRegistry.ts#resolveTrueValue` den Wahrheitswert bei Bedarf
 * aus dem WorldState auf. Nebeneffekt: "kein Agent liest je `trueValue`" ist
 * dadurch kein Vorsatz mehr, sondern eine Funktion, die im Agentenpfad
 * schlicht nicht aufrufbar ist.
 */
export interface InfoItem {
  id: InfoId;
  topic: InfoTopic;
  subject: { kind: 'agent' | 'location' | 'alliance' | 'world'; ref: string };
  valueType: 'quantity' | 'boolean' | 'categorical' | 'event_ref';
  createdRound: Round;
  /** steuert, wie schnell Wissen darueber veraltet */
  volatility: 'static' | 'slow' | 'fast';
}

/** Doc 03 §3.4.2 — was ein Agent *glaubt*. Kann von der Weltwahrheit abweichen. */
export interface KnowledgeEntry {
  infoId: InfoId;
  believedValue: InfoValue;
  /**
   * Sicherheit zum Zeitpunkt `lastConfirmedRound`. Der wirksame Wert sinkt mit
   * der Zeit und wird von `knowledge.ts#effectiveCertainty` berechnet, nicht
   * gespeichert — sonst braeuchte jede Runde einen Effekt pro Wissenseintrag
   * pro Agent, nur damit eine Zahl kleiner wird.
   */
  certainty: Score01;
  source: 'observed' | 'participated' | 'told_by' | 'inferred';
  /** Pflicht bei 'told_by' */
  sourceAgent?: AgentId;
  /**
   * Erweiterung gegenueber Doc 03 §3.4.2: das Event, aus dem dieses Wissen
   * entstanden ist. Ohne diesen Herkunftsnachweis ist `no-omniscience`
   * (Doc 08 §8.4) nicht pruefbar, sondern nur behauptbar.
   */
  sourceEventId?: EventId;
  acquiredRound: Round;
  lastConfirmedRound: Round;
  /** wem habe ich das schon gegeben — ab T18 */
  sharedWith: AgentId[];
  isSecret: boolean;
}

// ── 3.9 Location ─────────────────────────────────────────────────────────────

export interface Location {
  id: LocationId;
  name: string;
  neighbors: LocationId[];
  /** was hier liegt und geerntet werden kann */
  stock: Resources;
  regenPerRound: Partial<Resources>;
  capacity: Resources;
  /** an oeffentlichen Orten sind spaeter mehr Events sichtbar (Phase 2) */
  isPublic: boolean;
}

// ── 3.8 WorldEvent ───────────────────────────────────────────────────────────

/**
 * Nur die Event-Typen, die der Kern erzeugt. Jeder weitere Typ kommt mit der
 * Aktion, die ihn erzeugt — ein Event-Typ ohne Erzeuger ist toter Code.
 */
export type EventType =
  | 'match_started'
  | 'round_started'
  | 'agent_rested'
  | 'resource_gathered'
  /** Ernte lief ins Leere, weil ein frueher aufgeloester Agent den Bestand hatte. */
  | 'gather_failed'
  | 'agent_moved'
  | 'food_consumed'
  | 'agent_eliminated'
  | 'action_rejected'
  | 'round_ended'
  | 'match_ended';

export type Visibility =
  | { scope: 'public' }
  | { scope: 'location'; locationId: LocationId }
  | { scope: 'participants' }
  | { scope: 'alliance'; allianceId: AllianceId }
  | { scope: 'private'; agentIds: AgentId[] };

export interface WorldEvent {
  id: EventId;
  matchId: MatchId;
  round: Round;
  seq: number;
  type: EventType;
  actorId?: AgentId;
  targetId?: AgentId;
  allianceId?: AllianceId;
  locationId: LocationId | null;
  payload: Record<string, JsonValue>;
  visibility: Visibility;
  /**
   * Welche Infos dieses Event erzeugt oder beruehrt. Phase 2 macht daraus
   * Wissen — und nur daraus. Ein Event ohne `infoRefs` erzeugt kein Wissen,
   * auch wenn es beobachtet wurde.
   */
  infoRefs: InfoId[];
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// ── 3.8 Effect ───────────────────────────────────────────────────────────────

/**
 * Das Einzige, was der StateMutator akzeptiert (CLAUDE.md Regel 1).
 * Aktionen sind rein und liefern nur Effects zurueck.
 *
 * Abweichung von Doc 03 §3.8, bewusst und begruendet: `location_stock` ist dort
 * nicht aufgefuehrt, wird aber gebraucht. `gather_resource` verschiebt Bestand
 * vom Ort zum Agenten; ohne einen Effekt fuer die Ortsseite waere die Ernte eine
 * Quelle aus dem Nichts und die Erhaltungs-Invariante (Doc 03 §3.1) nicht
 * pruefbar. Ebenso `round_advance` / `match_end`: auch der Rundenzaehler und der
 * Match-Status sind World State und duerfen Regel 1 nicht umgehen.
 */
export type Effect =
  | { t: 'resource'; agentId: AgentId; delta: Partial<Resources> }
  | { t: 'location_stock'; locationId: LocationId; delta: Partial<Resources>; reason: StockChangeReason }
  | { t: 'need'; agentId: AgentId; delta: Partial<Needs> }
  | { t: 'status'; agentId: AgentId; patch: Partial<Pick<StatusFlags, 'hungerStreak' | 'exhaustionStreak'>> }
  | { t: 'move'; agentId: AgentId; to: LocationId }
  | { t: 'eliminate'; agentId: AgentId; cause: EliminationCause }
  /** Registriert eine Info als existent. Traegt keinen Wahrheitswert — siehe `InfoItem`. */
  | { t: 'info_item'; item: InfoItem }
  /** Der einzige Weg, auf dem ein `KnowledgeEntry` entsteht oder sich aendert. */
  | { t: 'knowledge'; agentId: AgentId; entry: KnowledgeEntry }
  | { t: 'round_advance' }
  | { t: 'match_end'; reason: EndReason };

/**
 * Doc 03 §3.1: Quellen und Senken muessen deklariert sein, sonst ist die
 * Erhaltungsregel nicht pruefbar. `transfer` bewegt nur, `regen` erzeugt,
 * `spoilage` vernichtet.
 */
export type StockChangeReason = 'transfer' | 'regen' | 'spoilage';

export type EndReason = 'round_limit' | 'survivor_threshold' | 'manual';

// ── 3.1 WorldState ───────────────────────────────────────────────────────────

/**
 * Doc 03 §3.1: `rngState` MUSS Teil des Snapshots sein, sonst kein Resume.
 *
 * Enthaelt die Zaehlerstaende der *langlebigen* Streams. Solange jeder
 * Streamschluessel die Runde traegt (`gather:7:agent_003`), ist die Folge auch
 * ohne gespeicherten Zaehler reproduzierbar und dieses Objekt bleibt leer — das
 * ist der Normalfall im Kern. Geschrieben wird es beim Erzeugen der Welt und
 * beim Snapshot (T27), nicht waehrend einer Runde; damit bleibt es ausserhalb
 * der Zustaendigkeit des StateMutators.
 */
export type RngStateBundle = Record<string, number>;

export interface WorldState {
  matchId: MatchId;
  seed: number;
  round: Round;
  config: MatchConfig;
  rngState: RngStateBundle;
  agents: Record<AgentId, Agent>;
  locations: Record<LocationId, Location>;
  /** objektive Wahrheit; Agenten sehen das NIE (Doc 03 §3.1) */
  infoRegistry: Record<InfoId, InfoItem>;
  status: 'running' | 'finished';
  endReason?: EndReason;
}

/**
 * Abweichung von Doc 03 §3.1, bewusst: dort steht `eventSeq` im WorldState.
 * Der Zaehler gehoert aber dem EventLog — es ist seine einzige Schreibstelle,
 * und ein Zaehler im State, den irgendwer ausserhalb des StateMutators
 * hochzaehlt, waere ein direkter Bruch von Regel 1. Beim Resume aus einem
 * Snapshot wird er aus der Laenge des Logs rekonstruiert.
 */

// ── 3.10 MatchConfig ─────────────────────────────────────────────────────────

/**
 * Nur die Abschnitte, die der Kern liest. `llm`, `memory`, `learning`, `info`,
 * `relationships` und `persistence` aus Doc 03 §3.10 kommen mit den Systemen,
 * die sie brauchen.
 */
export interface MatchConfig {
  agentCount: number;
  maxRounds: number;
  /** Abbruch bei <= n Ueberlebenden */
  survivorThreshold: number;
  seed: number;
  llmMode: 'off' | 'mock' | 'live';
  economy: EconomyConfig;
  info: InfoConfig;
  /** Invarianten nach jeder Mutation pruefen. In Long-Run-Batches abschaltbar. */
  strictInvariants: boolean;
}

/** Doc 03 §3.10, Abschnitt `info`. */
export interface InfoConfig {
  /** Ab dieser Sicherheit darf eine Aussage als Tatsache gelten (Doc 08 §8.2.2 R2). */
  assertCertaintyThreshold: Score01;
  /** Sicherheitsverlust pro Runde bei `volatility: 'fast'` */
  decayFast: number;
  /** dito bei `volatility: 'slow'`; `'static'` verfaellt nie */
  decaySlow: number;
}

export interface EconomyConfig {
  /** Satiety-Verlust pro Runde (Phase 1 Upkeep) */
  satietyDecayPerRound: number;
  /** passive Energie-Regeneration pro Runde (Phase 1 Upkeep) */
  energyRegenPerRound: number;
  /** Basisertrag einer Ernte, moduliert durch Energie und RNG */
  gatherBase: number;
  /** Energiekosten einer Ernte */
  gatherEnergyCost: number;
  /** Energiegewinn durch `rest` */
  restEnergyGain: number;
  /** Satiety-Kosten von `rest` (Doc 04: "kleiner satiety-Verlust") */
  restSatietyCost: number;
  /** Nahrung, die ein `consume` verbraucht */
  foodPerRound: number;
  /** Saettigung, die ein `consume` bringt */
  satietyPerFood: number;
  /** Energiekosten eines Ortswechsels */
  moveEnergyCost: number;
  /** Runden mit satiety === 0 bis zum Verhungern */
  starvationRounds: number;
  /** Runden mit energy === 0 bis zur Erschoepfung */
  exhaustionRounds: number;
}

// ── Rundenergebnis (kein State — der Runner akkumuliert, nicht der WorldState) ─

export type RejectReason =
  | 'schema_invalid'
  | 'actor_invalid'
  | 'target_invalid'
  | 'precondition_failed'
  | 'insufficient_resources'
  | 'unknown_reference'
  | 'effect_invalid';

export interface AgentAction {
  actorId: AgentId;
  type: ActionType;
  params: Record<string, JsonValue>;
  source: 'policy' | 'llm' | 'fallback' | 'scripted';
}
