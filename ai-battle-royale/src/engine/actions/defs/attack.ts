/**
 * `attack` — Erweiterung gegenueber Doc 04 §4.1, auf Ansage.
 *
 * Doc 01 §1.4 schliesst ein Kampf- und Toetungssystem ausdruecklich aus
 * ("Schwerpunkt ist sozial. Ausscheiden nur ueber Beduerfnisse und Exile").
 * Diese Aktion hebt das auf. Der Rest der Architektur bleibt unangetastet: der
 * Kampf ist eine reine Funktion, die `Effect[]` liefert, jeder Wurf laeuft
 * durch einen benannten Stream, und getoetet wird ueber denselben
 * `eliminate`-Effekt wie beim Verhungern.
 *
 * Wie ein Kampf ausgeht:
 *
 *   Staerke × (0.7 + 0.6 · Wurf)     — beide Seiten, mit eigenem Glueck
 *   + Verteidiger: × (1 + 0.4 · Intelligenz/100)
 *
 * Klugheit schuetzt also, ohne Kraft zu ersetzen. Der Vorsprung des Siegers
 * entscheidet ueber die Folgen: ab `killMargin` toedlich, darunter Schaden an
 * Energie und Saettigung. Wer verliert, verliert ausserdem einen Teil seiner
 * Vorraete an den Sieger — ohne Beute waere Angreifen nie rational.
 *
 * Ein Angriff kann nach hinten losgehen: faellt der Vergleich zugunsten des
 * Verteidigers aus, trifft der Schaden den Angreifer. Sonst waere Angreifen
 * risikolos, und ein risikoloser Angriff ist keine Entscheidung.
 */

import { getAgent } from '../../core/access.js';
import { RESOURCE_KINDS } from '../../core/resources.js';
import type { AgentId, Effect, JsonValue, Resources } from '../../core/types.js';
import { attributesOf, instinctsOf, luckyRoll } from '../../agents/attributes.js';
import { attributeInfoId } from '../../information/infoRegistry.js';
import { effect } from '../../mutation/effects.js';
import type { ActionCandidate, ActionContext, ActionDef } from '../types.js';
import { OK, reject } from '../types.js';

export const attackAction: ActionDef = {
  type: 'attack',
  tier: 'strategic',
  cost: { energy: 0 }, // tatsaechliche Kosten: config.combat.energyCost
  cooldown: 3,
  requiresTarget: true,
  allowsStatement: false,

  generate(agent, ctx): ActionCandidate[] {
    if (agent.needs.energy < ctx.state.config.combat.energyCost) return [];
    const ready = agent.cooldowns['attack'];
    if (ready !== undefined && ctx.round < ready) return [];

    return targetsAt(agent.id, agent.location, ctx).map((target) => ({
      type: 'attack' as const,
      params: { target: target.id },
      label: `attack:${target.id}`,
    }));
  },

  precondition(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    const targetId = readTarget(action.params);
    if (!targetId) {
      return reject('schema_invalid', `attack ohne gueltigen Parameter target: ${JSON.stringify(action.params)}`);
    }
    if (targetId === agent.id) {
      return reject('target_invalid', 'Ein Agent kann sich nicht selbst angreifen');
    }

    const target = ctx.state.agents[targetId];
    if (!target) return reject('target_invalid', `Agent ${targetId} existiert nicht`);
    if (!target.alive) return reject('target_invalid', `Agent ${targetId} ist ausgeschieden`);
    if (target.location !== agent.location) {
      return reject('target_invalid', `Agent ${targetId} ist nicht am selben Ort`);
    }

    const cost = ctx.state.config.combat.energyCost;
    if (agent.needs.energy < cost) {
      return reject('precondition_failed', `energy ${agent.needs.energy} < ${cost}`);
    }

    const ready = agent.cooldowns['attack'];
    if (ready !== undefined && ctx.round < ready) {
      return reject('precondition_failed', `attack erst ab Runde ${ready} wieder moeglich`);
    }

    return OK;
  },

  resolve(action, ctx) {
    const attacker = getAgent(ctx.state, action.actorId);
    const targetId = readTarget(action.params);
    if (!targetId) throw new Error('attack ohne Parameter target in resolve — Validierung uebersprungen?');
    const defender = getAgent(ctx.state, targetId);

    const config = ctx.state.config;
    const attackerAttrs = attributesOf(attacker, config.attributes);
    const defenderAttrs = attributesOf(defender, config.attributes);

    // Jede Seite wuerfelt in einem eigenen Stream — sonst wuerde die Zahl der
    // Wuerfe der einen Seite die Folge der anderen verschieben.
    const attackRoll = luckyRoll(
      ctx.rng.derive('combat', ctx.round, attacker.id, 'attack'),
      instinctsOf(attackerAttrs).luck,
    );
    const defenceRoll = luckyRoll(
      ctx.rng.derive('combat', ctx.round, defender.id, 'defence'),
      instinctsOf(defenderAttrs).luck,
    );

    const attackPower = attackerAttrs.strength * (0.7 + 0.6 * attackRoll);
    const defencePower =
      defenderAttrs.strength *
      (0.7 + 0.6 * defenceRoll) *
      (1 + 0.4 * (defenderAttrs.intelligence / 100));

    const total = attackPower + defencePower;
    // Vorsprung des Siegers, 0..1. Bei Gleichstand null.
    const margin = total === 0 ? 0 : Math.abs(attackPower - defencePower) / total;
    const attackerWins = attackPower > defencePower;
    const loser = attackerWins ? defender : attacker;
    const winner = attackerWins ? attacker : defender;
    // Toedlich auf zwei Wegen. Der Vorsprung allein reicht selten: zwischen
    // vergleichbaren Agenten muesste eine Seite rund doppelt so stark sein,
    // und das kommt kaum vor — gemessen 210 Kaempfe ohne einen einzigen Toten.
    // Entscheidend ist deshalb der Schaden: wer am Boden liegt, steht nicht
    // wieder auf. Damit wird der Zeitpunkt zur Waffe, nicht nur die Kraft.
    const damage = Math.round(config.combat.damageScale * margin);
    const lethal = margin >= config.combat.killMargin || damage >= loser.needs.energy;

    const effects: Effect[] = [
      effect.need(attacker.id, { energy: -Math.min(config.combat.energyCost, attacker.needs.energy) }),
      effect.cooldown(attacker.id, 'attack', ctx.round + config.combat.cooldown),
    ];

    // Beute gegen den Stand rechnen, der in dieser Runde noch uebrig ist —
    // nicht gegen den Stand vom Rundenbeginn.
    const share = lethal ? 1 : config.combat.lootShare;
    const loot: Resources = { food: 0, coins: 0, materials: 0 };
    for (const kind of RESOURCE_KINDS) {
      const amount = Math.floor(ctx.projection.agentResource(loser.id, kind) * share);
      if (amount > 0) loot[kind] = amount;
    }
    if (RESOURCE_KINDS.some((kind) => loot[kind] > 0)) {
      effects.push(
        effect.resource(loser.id, negate(loot)),
        effect.resource(winner.id, loot),
      );
    }

    if (lethal) {
      effects.push(effect.eliminate(loser.id, 'killed', winner.id));
      effects.push(effect.kill(winner.id));
      effects.push(
        effect.experience(winner.id, { strength: config.attributes.fightWinGain }),
      );
    } else {
      // Kein toedlicher Ausgang: der Verlierer traegt Schaden davon.
      effects.push(
        effect.need(loser.id, {
          energy: -Math.min(damage, loser.needs.energy),
          satiety: -Math.min(Math.round(damage / 2), loser.needs.satiety),
        }),
        effect.experience(winner.id, { strength: config.attributes.fightWinGain }),
        // Auch eine Niederlage lehrt etwas — aber Gespuer, nicht Kraft.
        effect.experience(loser.id, { intuition: config.attributes.fightLossGain }),
      );
    }

    const events = [
      {
        round: ctx.round,
        type: lethal ? ('agent_killed' as const) : ('agent_attacked' as const),
        actorId: attacker.id,
        targetId: defender.id,
        locationId: attacker.location,
        payload: {
          attackerWins,
          // Wer unterlegen war — und im toedlichen Fall: wer gestorben ist.
          // Das kann der Angreifer selbst sein, deshalb genuegen `actorId` und
          // `targetId` nicht.
          loserId: loser.id,
          winnerId: winner.id,
          margin: Math.round(margin * 1000) / 1000,
          damage,
          lethal,
          loot: loot as unknown as JsonValue,
        },
        // Ein Kampf ist am Ort nicht zu uebersehen; ein Toter faellt allen auf.
        visibility: lethal
          ? ({ scope: 'public' } as const)
          : ({ scope: 'location', locationId: attacker.location } as const),
        // Wer den Kampf gesehen hat, weiss danach etwas ueber die Kraft beider.
        infoRefs: [
          attributeInfoId(attacker.id, 'strength'),
          attributeInfoId(defender.id, 'strength'),
        ],
      },
    ];

    return { effects, events };
  },
};

function targetsAt(self: AgentId, location: string, ctx: ActionContext) {
  return (Object.keys(ctx.state.agents) as AgentId[])
    .sort()
    .map((id) => ctx.state.agents[id])
    .filter((other) => other && other.alive && other.id !== self && other.location === location)
    .map((other) => other!);
}

function negate(resources: Readonly<Resources>): Resources {
  return { food: -resources.food, coins: -resources.coins, materials: -resources.materials };
}

function readTarget(params: Record<string, JsonValue>): AgentId | null {
  const value = params['target'];
  return typeof value === 'string' && value.startsWith('agent_') ? (value as AgentId) : null;
}
