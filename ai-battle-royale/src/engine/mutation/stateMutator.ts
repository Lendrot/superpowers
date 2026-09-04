/**
 * T06 — StateMutator: die EINZIGE Schreibstelle des World State.
 *
 * CLAUDE.md Regel 1. Jede andere Signatur der Engine nimmt `Readonly<WorldState>`
 * entgegen; nur hier steht `WorldState` ohne `Readonly`. Nach jedem Batch:
 * Erhaltungspruefung und `assertInvariants`.
 *
 * Warum als Batch und nicht pro Effekt: die Erhaltungsregel ist eine Aussage
 * ueber eine *abgeschlossene* Aenderung. Eine Ernte besteht aus zwei Effekten
 * (−Ort, +Agent); dazwischen ist der Bestand zwangslaeufig unstimmig.
 */

import { getAgent, getLocation } from '../core/access.js';
import { InvariantError, assertInvariants, totalResources } from '../core/invariants.js';
import { defaultRelationship } from '../core/relationship.js';
import { emptyResources, RESOURCE_KINDS } from '../core/resources.js';
import { ATTRIBUTE_TRACKS, PERSONALITY_TRAITS } from '../core/types.js';
import type { Alliance, AllianceId, Effect, Resources, WorldState } from '../core/types.js';
import { describeEffect, expectedResourceDelta } from './effects.js';

/**
 * Letzter vom Mutator selbst hergestellter Gesamtbestand je World State.
 *
 * Damit wird die Erhaltungspruefung erst scharf: ohne dieses Gedaechtnis
 * vergliche sie nur Anfang und Ende desselben Batches und koennte einen
 * direkten Zugriff zwischen zwei Batches gar nicht bemerken — also genau den
 * Fall, den Regel 1 verbietet. Eine WeakMap, damit ein verworfener State nicht
 * am Speicher haengen bleibt.
 */
const knownTotals = new WeakMap<WorldState, Resources>();

export interface ApplyOptions {
  /**
   * Invarianten nach dem Batch pruefen. Default: `state.config.strictInvariants`.
   * In Long-Run-Batches abschaltbar (Doc 08 §8.1) — in Tests immer an.
   */
  checkInvariants?: boolean;
}

export interface ApplyResult {
  applied: number;
}

/**
 * Wendet einen Batch validierter Effects an. Wirft bei jedem Versuch, einen
 * unzulaessigen Zustand herzustellen — der Aufrufer haette das in der
 * Validierungskette abfangen muessen (Doc 08 §8.1, Stufe 9).
 */
export function applyEffects(
  state: WorldState,
  effects: readonly Effect[],
  options: ApplyOptions = {},
): ApplyResult {
  const before = totalResources(state);
  assertNoForeignWrite(state, before);

  for (const item of effects) {
    applyOne(state, item);
  }

  const after = assertConservation(state, before, effects);
  knownTotals.set(state, after);

  if (options.checkInvariants ?? state.config.strictInvariants) {
    assertInvariants(state);
  }

  return { applied: effects.length };
}

function applyOne(state: WorldState, item: Effect): void {
  switch (item.t) {
    case 'resource': {
      const agent = getAgent(state, item.agentId);
      requireAlive(state, item);
      for (const kind of RESOURCE_KINDS) {
        const delta = item.delta[kind];
        if (delta === undefined || delta === 0) continue;
        requireInteger(item, `delta.${kind}`, delta);
        const next = agent.resources[kind] + delta;
        if (next < 0) {
          throw new InvariantError(
            `${describeEffect(item)} wuerde ${kind} auf ${next} druecken (Agent ${agent.id})`,
          );
        }
        agent.resources[kind] = next;
      }
      return;
    }

    case 'location_stock': {
      const location = getLocation(state, item.locationId);
      for (const kind of RESOURCE_KINDS) {
        const delta = item.delta[kind];
        if (delta === undefined || delta === 0) continue;
        requireInteger(item, `delta.${kind}`, delta);
        const next = location.stock[kind] + delta;
        if (next < 0) {
          throw new InvariantError(
            `${describeEffect(item)} wuerde ${kind} auf ${next} druecken (Ort ${location.id})`,
          );
        }
        if (next > location.capacity[kind]) {
          // Kein stilles Kappen: wer regeneriert, muss selbst gegen die Kapazitaet
          // rechnen, sonst weicht die erwartete von der tatsaechlichen Aenderung ab
          // und die Erhaltungspruefung wird wertlos.
          throw new InvariantError(
            `${describeEffect(item)} wuerde capacity ${location.capacity[kind]} ueberschreiten (${next})`,
          );
        }
        location.stock[kind] = next;
      }
      return;
    }

    case 'need': {
      const agent = getAgent(state, item.agentId);
      requireAlive(state, item);
      for (const need of ['satiety', 'energy'] as const) {
        const delta = item.delta[need];
        if (delta === undefined || delta === 0) continue;
        requireInteger(item, `delta.${need}`, delta);
        // Stats sind per Definition auf 0..100 beschraenkt (Doc 03 §3.0) und
        // werden nicht erhalten — hier ist Kappen richtig, nicht Werfen.
        agent.needs[need] = clampStat(agent.needs[need] + delta);
      }
      return;
    }

    case 'status': {
      const agent = getAgent(state, item.agentId);
      if (item.patch.hungerStreak !== undefined) {
        requireInteger(item, 'hungerStreak', item.patch.hungerStreak);
        agent.status.hungerStreak = item.patch.hungerStreak;
      }
      if (item.patch.exhaustionStreak !== undefined) {
        requireInteger(item, 'exhaustionStreak', item.patch.exhaustionStreak);
        agent.status.exhaustionStreak = item.patch.exhaustionStreak;
      }
      return;
    }

    case 'move': {
      const agent = getAgent(state, item.agentId);
      requireAlive(state, item);
      const target = getLocation(state, item.to);
      agent.location = target.id;
      return;
    }

    case 'eliminate': {
      const agent = getAgent(state, item.agentId);
      if (!agent.alive) {
        throw new InvariantError(`${describeEffect(item)}: Agent ist bereits ausgeschieden`);
      }
      agent.alive = false;
      agent.eliminatedRound = state.round;
      agent.eliminationCause = item.cause;
      if (item.killedBy) agent.killedBy = item.killedBy;
      return;
    }

    case 'experience': {
      const agent = getAgent(state, item.agentId);
      const max = state.config.attributes.maxExperience;
      for (const track of ATTRIBUTE_TRACKS) {
        const delta = item.delta[track];
        if (delta === undefined || delta === 0) continue;
        requireInteger(item, track, delta);
        const next = agent.experience[track] + delta;
        if (next < 0 || next > max) {
          // Kein stilles Kappen: wer Erfahrung vergibt, muss selbst gegen die
          // Grenzen rechnen (`clampExperienceDelta`), sonst weicht die
          // angekuendigte von der tatsaechlichen Aenderung ab.
          throw new InvariantError(
            `${describeEffect(item)}: ${track} wuerde auf ${next} laufen (erlaubt 0..${max})`,
          );
        }
        agent.experience[track] = next;
      }
      return;
    }

    case 'personality': {
      const agent = getAgent(state, item.agentId);
      const limit = state.config.attributes.maxPersonalityDrift;
      for (const trait of PERSONALITY_TRAITS) {
        const delta = item.delta[trait];
        if (delta === undefined || delta === 0) continue;
        requireInteger(item, trait, delta);
        if (Math.abs(delta) > limit) {
          // Doc 03 §3.2.4 deckelt aus gutem Grund, wie schnell sich ein Agent
          // veraendern darf: ohne Deckel entstehen oszillierende Agenten, deren
          // Verhalten niemand mehr erklaeren kann.
          throw new InvariantError(
            `${describeEffect(item)}: Drift ${delta} ueberschreitet das Limit ±${limit}`,
          );
        }
        agent.personality[trait] = clampStat(agent.personality[trait] + delta);
      }
      return;
    }

    case 'cooldown': {
      const agent = getAgent(state, item.agentId);
      agent.cooldowns[item.action] = item.readyAtRound;
      return;
    }

    case 'kill': {
      const agent = getAgent(state, item.agentId);
      agent.kills += 1;
      return;
    }

    case 'relationship': {
      // `to` braucht keinen eigenen Zustand hier — nur die Existenz beider
      // Agenten ist Pflicht (eine Beziehung zu jemandem, den es nicht gibt,
      // waere ein stiller Fehler in der aufrufenden Phase).
      const from = getAgent(state, item.from);
      getAgent(state, item.to);

      const current = from.relationships[item.to] ?? defaultRelationship();
      const next = { ...current };
      for (const [stat, delta] of Object.entries(item.delta) as [keyof typeof item.delta, number][]) {
        if (delta === undefined || delta === 0) continue;
        requireInteger(item, stat, delta);
        next[stat] = stat === 'debt' ? current.debt + delta : clampStat(current[stat] + delta);
      }
      next.interactions = current.interactions + 1;
      next.lastInteractionRound = state.round;
      // Ringpuffer, max 5, aeltestes zuerst verdraengt.
      next.lastEventTypes = [...current.lastEventTypes, item.eventType].slice(-5);

      from.relationships[item.to] = next;
      return;
    }

    case 'statement': {
      // Der Wahrheitsvertrag braucht ein Gedaechtnis: ohne Aufzeichnung der
      // letzten Aussage kann R7 (Selbstwiderspruch) nichts vergleichen.
      getAgent(state, item.agentId);
      const perAgent = state.statementLog[item.agentId] ?? {};
      perAgent[item.record.infoId] = { ...item.record };
      state.statementLog[item.agentId] = perAgent;
      return;
    }

    case 'info_item': {
      const existing = state.infoRegistry[item.item.id];
      if (existing) {
        // Eine Info ist eine Identitaet, kein Wert. Sie zweimal zu registrieren
        // waere entweder ein Duplikat oder eine stille Umdefinition.
        if (existing.topic !== item.item.topic) {
          throw new InvariantError(
            `${describeEffect(item)}: Info existiert bereits mit Thema ${existing.topic}`,
          );
        }
        return;
      }
      state.infoRegistry[item.item.id] = { ...item.item, subject: { ...item.item.subject } };
      return;
    }

    case 'knowledge': {
      const agent = getAgent(state, item.agentId);
      requireAlive(state, item);
      if (!state.infoRegistry[item.entry.infoId]) {
        throw new InvariantError(
          `${describeEffect(item)}: Info ist nicht registriert (Doc 03 §3.1)`,
        );
      }
      if (item.entry.source === 'told_by' && !item.entry.sourceAgent) {
        // Doc 03 §3.4.2: bei 'told_by' ist sourceAgent Pflicht. Ohne Quelle ist
        // spaeter R5 (Hoerensagen muss attribuiert sein) nicht pruefbar.
        throw new InvariantError(`${describeEffect(item)}: 'told_by' ohne sourceAgent`);
      }
      agent.knowledge[item.entry.infoId] = { ...item.entry, sharedWith: [...item.entry.sharedWith] };
      return;
    }

    case 'alliance': {
      applyAllianceEffect(state, item);
      return;
    }

    case 'episode_add': {
      const agent = getAgent(state, item.agentId);
      if (agent.episodic.some((existing) => existing.id === item.episode.id)) {
        throw new InvariantError(`${describeEffect(item)}: Episode existiert bereits (Doc 08 §8.4)`);
      }
      agent.episodic.push({ ...item.episode, participants: [...item.episode.participants] });
      return;
    }

    case 'episode_upkeep': {
      const agent = getAgent(state, item.agentId);
      const { salienceDecay, maxEpisodes, compactionThreshold } = state.config.memory;
      const decayed = 1 - salienceDecay;
      for (const episode of agent.episodic) {
        episode.salience *= decayed;
      }
      if (agent.episodic.length > maxEpisodes) {
        // Kompaktierung statt Loeschen (Doc 03 §6.2): die Erkenntnis steckt
        // bereits in den Relationship-Deltas, die dieselbe Runde ueber Phase 8
        // gesetzt hat — hier verschwindet nur das Detail. Sortiert nach
        // Salience aufsteigend, `id` (= `EventId`, zeitlich geordnet) als
        // deterministischer Tie-Break.
        agent.episodic.sort((a, b) => a.salience - b.salience || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        const removeCount = Math.max(1, Math.round(agent.episodic.length * compactionThreshold));
        agent.episodic.splice(0, removeCount);
      }
      return;
    }

    case 'lesson_sync': {
      const agent = getAgent(state, item.agentId);
      const count = Object.keys(item.lessons).length;
      if (count > state.config.learning.maxLessons) {
        // Der Miner muss VOR dem Effekt kuerzen, nicht der Mutator — dieselbe
        // Aufgabenteilung wie bei jedem anderen Effekt: der Erzeuger rechnet,
        // der Mutator prueft nur noch.
        throw new InvariantError(`${describeEffect(item)}: ${count} Lessons ueberschreiten maxLessons (${state.config.learning.maxLessons})`);
      }
      for (const [key, lesson] of Object.entries(item.lessons)) {
        if (lesson.key !== key) {
          throw new InvariantError(`${describeEffect(item)}: Schluessel '${key}' und lesson.key '${lesson.key}' weichen ab`);
        }
        if (lesson.supportingEpisodeIds.length === 0) {
          throw new InvariantError(`${describeEffect(item)}: Lesson '${key}' ohne supportingEpisodeIds (CLAUDE.md Regel 8)`);
        }
        if (lesson.supportingEpisodeIds.length > 5) {
          throw new InvariantError(`${describeEffect(item)}: Lesson '${key}' hat mehr als 5 supportingEpisodeIds`);
        }
        for (const episodeId of lesson.supportingEpisodeIds) {
          if (!agent.episodic.some((episode) => episode.id === episodeId)) {
            // CLAUDE.md Regel 8, woertlich: eine Lesson ohne Beleg aus dem
            // EIGENEN Speicher waere Wissen aus dem Nichts.
            throw new InvariantError(
              `${describeEffect(item)}: Lesson '${key}' beruft sich auf ${episodeId}, das nicht in ${agent.id}s episodic steht`,
            );
          }
        }
      }
      agent.lessons = Object.fromEntries(
        Object.entries(item.lessons).map(([key, lesson]) => [key, { ...lesson, supportingEpisodeIds: [...lesson.supportingEpisodeIds] }]),
      );
      return;
    }

    case 'round_advance': {
      state.round += 1;
      return;
    }

    case 'match_end': {
      state.status = 'finished';
      state.endReason = item.reason;
      return;
    }
  }
}

/**
 * T20 — die vier Allianz-Ops. Eigene Funktion statt ein weiterer Case-Zweig,
 * weil hier mehr als eine Feldaenderung haengt: Mitgliederlisten bleiben
 * sortiert (dieselbe Stabilitaetsregel wie ueberall), und Fuehrungswechsel wie
 * Aufloesung sind — wie `Relationship.interactions` — vom Mutator selbst
 * hergeleitete Buchhaltung, keine Angabe im Effect.
 */
function applyAllianceEffect(state: WorldState, item: Extract<Effect, { t: 'alliance' }>): void {
  switch (item.op) {
    case 'create': {
      if (state.alliances[item.id]) {
        throw new InvariantError(`${describeEffect(item)}: Allianz-Id existiert bereits`);
      }
      const founder = getAgent(state, item.founderId);
      const joiner = getAgent(state, item.joinerId);
      if (!founder.alive || !joiner.alive) {
        throw new InvariantError(`${describeEffect(item)}: Gruendung mit ausgeschiedenem Agenten`);
      }
      if (founder.allianceId !== null || joiner.allianceId !== null) {
        throw new InvariantError(`${describeEffect(item)}: mindestens einer ist bereits in einer Allianz`);
      }
      const alliance: Alliance = {
        id: item.id,
        name: item.name,
        founderId: item.founderId,
        members: [founder.id, joiner.id].sort(),
        leaderId: item.founderId,
        sharedStock: emptyResources(),
        createdRound: state.round,
      };
      state.alliances[item.id] = alliance;
      founder.allianceId = item.id;
      joiner.allianceId = item.id;
      return;
    }

    case 'join': {
      const alliance = requireAlliance(state, item.id, item);
      const agent = getAgent(state, item.agentId);
      if (!agent.alive) throw new InvariantError(`${describeEffect(item)}: Agent ist ausgeschieden`);
      if (agent.allianceId !== null) {
        throw new InvariantError(`${describeEffect(item)}: ${agent.id} ist bereits in einer Allianz`);
      }
      const aliveMembers = alliance.members.filter((id) => state.agents[id]?.alive).length;
      if (aliveMembers >= state.config.alliance.maxSize) {
        throw new InvariantError(`${describeEffect(item)}: Allianz ${alliance.id} ist voll (${aliveMembers})`);
      }
      alliance.members = [...alliance.members, agent.id].sort();
      agent.allianceId = alliance.id;
      return;
    }

    case 'leave': {
      const alliance = requireAlliance(state, item.id, item);
      const agent = getAgent(state, item.agentId);
      if (agent.allianceId !== alliance.id || !alliance.members.includes(agent.id)) {
        throw new InvariantError(`${describeEffect(item)}: ${agent.id} ist nicht Mitglied von ${alliance.id}`);
      }
      alliance.members = alliance.members.filter((id) => id !== agent.id);
      agent.allianceId = null;
      settleMembershipChange(state, alliance);
      return;
    }

    case 'expel': {
      const alliance = requireAlliance(state, item.id, item);
      const agent = getAgent(state, item.agentId);
      if (agent.id === alliance.leaderId) {
        throw new InvariantError(`${describeEffect(item)}: der Leader kann sich nicht selbst ausschliessen`);
      }
      if (agent.allianceId !== alliance.id || !alliance.members.includes(agent.id)) {
        throw new InvariantError(`${describeEffect(item)}: ${agent.id} ist nicht Mitglied von ${alliance.id}`);
      }
      alliance.members = alliance.members.filter((id) => id !== agent.id);
      agent.allianceId = null;
      agent.status.exiledFrom = [...agent.status.exiledFrom, alliance.id];
      settleMembershipChange(state, alliance);
      return;
    }
  }
}

function requireAlliance(state: WorldState, id: AllianceId, item: Effect): Alliance {
  const alliance = state.alliances[id];
  if (!alliance || alliance.dissolvedRound !== undefined) {
    throw new InvariantError(`${describeEffect(item)}: Allianz ${id} existiert nicht oder ist aufgeloest`);
  }
  return alliance;
}

/**
 * Nach jedem Abgang: faellt die Zahl LEBENDER Mitglieder unter zwei, loest die
 * Allianz auf — eine Allianz aus einer Person ist keine. Verliert sie dabei
 * ihren Leader, uebernimmt das lebende Mitglied mit der kleinsten AgentId
 * (`members` ist immer sortiert) — derselbe deterministische Tie-Break wie
 * bei der Aufloesungsreihenfolge (Doc 04 §4.3).
 */
function settleMembershipChange(state: WorldState, alliance: Alliance): void {
  const aliveMembers = alliance.members.filter((id) => state.agents[id]?.alive);
  if (aliveMembers.length < 2) {
    alliance.dissolvedRound = state.round;
    for (const id of alliance.members) {
      const member = state.agents[id];
      if (member && member.allianceId === alliance.id) member.allianceId = null;
    }
    return;
  }
  if (!aliveMembers.includes(alliance.leaderId)) {
    alliance.leaderId = aliveMembers[0]!;
  }
}

function assertConservation(
  state: Readonly<WorldState>,
  before: Readonly<Resources>,
  effects: readonly Effect[],
): Resources {
  const after = totalResources(state);
  const expected = expectedResourceDelta(effects);
  for (const kind of RESOURCE_KINDS) {
    const actual = after[kind] - before[kind];
    if (actual !== expected[kind]) {
      throw new InvariantError(
        `Erhaltung verletzt fuer ${kind}: Effekte fordern ${expected[kind]}, angewendet wurden ${actual}. ` +
          'Der Mutator hat die Effekte anders ausgefuehrt, als sie beschrieben sind.',
      );
    }
  }
  return after;
}

/**
 * Weicht der Bestand beim Betreten des Mutators von dem ab, den er zuletzt
 * selbst hergestellt hat, hat dazwischen jemand anders geschrieben — Regel 1.
 * Beim ersten Aufruf fuer einen State gibt es nichts zu vergleichen; der
 * Startzustand aus `initWorld` ist der Bezugspunkt.
 */
function assertNoForeignWrite(state: Readonly<WorldState>, before: Readonly<Resources>): void {
  const known = knownTotals.get(state as WorldState);
  if (!known) return;

  for (const kind of RESOURCE_KINDS) {
    if (known[kind] !== before[kind]) {
      throw new InvariantError(
        `Erhaltung verletzt fuer ${kind}: erwartet ${known[kind]}, vorgefunden ${before[kind]}. ` +
          'Da hat jemand am StateMutator vorbei geschrieben (Regel 1).',
      );
    }
  }
}

function requireAlive(state: Readonly<WorldState>, item: Effect): void {
  if (!('agentId' in item)) return;
  const agent = getAgent(state, item.agentId);
  if (!agent.alive) {
    throw new InvariantError(`${describeEffect(item)}: Agent ist ausgeschieden`);
  }
}

function requireInteger(item: Effect, field: string, value: number): void {
  if (!Number.isInteger(value)) {
    throw new InvariantError(`${describeEffect(item)}: ${field} muss ganzzahlig sein, war ${value}`);
  }
}

function clampStat(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}
