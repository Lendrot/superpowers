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

// ── Attribute: was ein Agent KANN (Erweiterung gegenueber Doc 03) ────────────

/**
 * Drei Faehigkeiten, die sich im Lauf eines Matches entwickeln.
 *
 * Abgrenzung zur `Personality`: die Persoenlichkeit ist die *Veranlagung* (aus
 * dem Archetyp gezogen), die Attribute sind das *Koennen* (erworben). Alle
 * Agenten starten mit demselben Wert — wer stark wird, ist es geworden.
 *
 * Gespeichert wird nicht das Attribut, sondern die Erfahrung dahinter
 * (`Experience`); der Attributwert ist eine Funktion davon
 * (`agents/attributes.ts`). Sonst gaebe es zwei Zahlen fuer dieselbe Sache, die
 * bei jeder Aenderung synchron gehalten werden muessten — derselbe Grund, aus
 * dem `InfoItem` keinen `trueValue` traegt.
 */
export interface Attributes {
  /** Verstand: schuetzt im Kampf, erhoeht den Ueberlebensinstinkt */
  intelligence: Stat;
  /** Kraft: entscheidet Kaempfe, erhoeht den Machtinstinkt */
  strength: Stat;
  /** Gespuer: erhoeht das Glueck bei jedem Wurf */
  intuition: Stat;
}

export type AttributeTrack = keyof Attributes;

export const ATTRIBUTE_TRACKS = [
  'intelligence',
  'strength',
  'intuition',
] as const satisfies readonly AttributeTrack[];

/** Erfahrungspunkte je Faehigkeit. 0..`attributes.maxExperience`. */
export type Experience = Record<AttributeTrack, number>;

/**
 * Die drei Instinkte, die aus den Attributen folgen — der Mechanismus, ueber den
 * sich das Verhalten eines Agenten im Lauf des Matches veraendert.
 */
export interface Instincts {
  /** aus Intelligenz: Neigung, das eigene Ueberleben ueber alles zu stellen */
  survival: Score01;
  /** aus Kraft: Neigung, Macht zu suchen und durchzusetzen */
  power: Score01;
  /** aus Intuition: wirkt auf jeden Wurf, den der Agent macht */
  luck: Score01;
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

/**
 * `killed` ist eine bewusste Abweichung von Doc 01 §1.4, wo ein Kampf- und
 * Toetungssystem ausdruecklich ausgeschlossen ist. Auf Ansage aufgenommen.
 */
export type EliminationCause = 'starvation' | 'exhaustion' | 'exile' | 'killed';

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
  | 'confront'
  /** Erweiterung gegenueber Doc 04 §4.1 — siehe `EliminationCause`. */
  | 'attack';

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
  /** wer den Agenten getoetet hat, falls `eliminationCause === 'killed'` */
  killedBy?: AgentId;
  location: LocationId;

  /**
   * Veranlagung. Doc 03 §3.2.1 nennt sie konstant; sie driftet jetzt in engen
   * Grenzen (max ±1 pro Runde und Achse, Phase 8) aus dem, was der Agent
   * erlebt. Bewusste Abweichung auf Ansage.
   */
  personality: Personality;
  /** Erfahrungspunkte je Faehigkeit; der Attributwert wird daraus abgeleitet. */
  experience: Experience;
  /** Wieviele Agenten dieser hier getoetet hat — Grundlage der Macht. */
  kills: number;
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
  /** wie stark/klug/intuitiv Agent Z ist (Erweiterung, siehe `Attributes`) */
  | 'agent_attribute'
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
  | 'agent_attacked'
  | 'agent_killed'
  /** Angriff lief ins Leere, weil das Ziel in dieser Runde schon gefallen war. */
  | 'attack_aborted'
  | 'attribute_grown'
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
  | { t: 'eliminate'; agentId: AgentId; cause: EliminationCause; killedBy?: AgentId }
  /** Erfahrungsgewinn oder -verfall; der Attributwert folgt daraus. */
  | { t: 'experience'; agentId: AgentId; delta: Partial<Experience> }
  /** Drift der Veranlagung — max ±`attributes.maxPersonalityDrift` pro Achse. */
  | { t: 'personality'; agentId: AgentId; delta: Partial<Personality> }
  /** Frueheste Runde, in der eine Aktion wieder erlaubt ist. */
  | { t: 'cooldown'; agentId: AgentId; action: ActionType; readyAtRound: Round }
  /** Erhoeht den Toetungszaehler — Grundlage der Macht. */
  | { t: 'kill'; agentId: AgentId }
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
  attributes: AttributeConfig;
  combat: CombatConfig;
  /** Invarianten nach jeder Mutation pruefen. In Long-Run-Batches abschaltbar. */
  strictInvariants: boolean;
}

/** Entwicklung der Faehigkeiten. Alle Werte sind **[ANNAHME]**. */
export interface AttributeConfig {
  /** Erfahrung, mit der jeder Agent startet — daher sind alle gleich stark. */
  startExperience: number;
  /** Erfahrungspunkte je Attributpunkt */
  pointsPerLevel: number;
  /** Obergrenze; entspricht Attributwert 100 */
  maxExperience: number;
  /**
   * Verfall pro Runde, **proportional zum Niveau**: `max(1, round(punkte /
   * decayScale))`. Ein fester Verfall haette dazu gefuehrt, dass jede haeufige
   * Taetigkeit ihre Faehigkeit ins Maximum treibt und alle anderen auf null —
   * gemessen: Kraft 100, Intelligenz 14, Intuition 11 bei jedem Agenten.
   * Proportional entsteht ein Gleichgewicht bei `25 · Haeufigkeit · Gewinn`:
   * Spezialisten kommen auf ~80, Allrounder auf ~33.
   */
  decayScale: number;
  /**
   * Unterhalb dieser Punktzahl verfaellt nichts mehr. Grundkompetenz erodiert
   * nicht: ohne Boden fielen vernachlaessigte Faehigkeiten auf null, und ein
   * Agent mit Intelligenz 0 hat keinen Ueberlebensinstinkt mehr — gemessen ein
   * Todesspiral, in der die Vernachlaessigung sich selbst verstaerkt.
   */
  decayFloor: number;
  /** Kraft durch koerperliche Arbeit (Ernte) */
  gatherGain: number;
  /**
   * Intuition durch Ortswechsel. Deutlich groesser als die uebrigen Gewinne,
   * weil Umziehen rund 70-mal seltener ist als Ernten (gemessen: 0,008 gegen
   * 0,574 Ereignisse pro Agent und Runde). Bei gleichem Gewinn koennte
   * Intuition das Gleichgewicht der anderen Faehigkeiten nie erreichen — sie
   * lag bei jedem Agenten auf dem Boden.
   */
  moveGain: number;
  /**
   * Intuition durch eine ins Leere gelaufene Ernte.
   *
   * Wer oft danebengreift, lernt zu erkennen, wo sich das Hinsehen lohnt. Das
   * ist die zweite, haeufige Quelle, ohne die Intuition an einer seltenen
   * Aktion haengt — und es ist bewusst eine Rueckkopplung gegen den Erfolg:
   * Glueck waechst dort, wo es bisher fehlte. Wer stets zuerst am Bestand ist,
   * braucht kein Gespuer.
   */
  gatherFailedGain: number;
  /** Intelligenz durch Ruhe — Nachdenken ist die Taetigkeit, die klug macht */
  restGain: number;
  /** Intelligenz je neu erworbenem Wissenseintrag, zusaetzlich */
  learnGain: number;
  /** Kraft durch einen gewonnenen Kampf */
  fightWinGain: number;
  /** auch Verlieren lehrt etwas — Intuition */
  fightLossGain: number;
  /** maximale Drift der Veranlagung pro Runde und Achse */
  maxPersonalityDrift: number;
}

/** Kampfsystem. Abweichung von Doc 01 §1.4, auf Ansage. */
export interface CombatConfig {
  energyCost: number;
  cooldown: number;
  /**
   * Ab diesem relativen Vorsprung endet ein Kampf toedlich. Darunter kostet er
   * das Opfer nur Energie und Saettigung.
   */
  killMargin: Score01;
  /** Anteil der Vorraete, den der Sieger erbeutet */
  lootShare: Score01;
  /** Skalierung des Schadens auf Energie und Saettigung */
  damageScale: number;
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
