/**
 * Doc 04 §4.1 Nr. 6 — `share_information`.
 *
 * Statement ist **Pflicht** (die einzige implementierte Aktion, bei der das
 * gilt): wer teilt, muss sagen, was er teilt. `generate` waehlt dafuer die
 * bestbelegte eigene Ueberzeugung aus — dieselbe Erste-Verteidigungslinie-Logik
 * wie ueberall (Doc 08 §8.2.4): was hier entsteht, ist bereits legal, Stufe 7
 * prueft nur noch nach.
 *
 * `infoRefs` des erzeugten Events bleibt bewusst LEER. Waere die geteilte
 * `InfoId` dort eingetragen, wuerde Phase 2 (`perception.ts`) beim naechsten
 * Durchlauf ALLEN Anwesenden — nicht nur dem Ziel — die Weltwahrheit
 * zuschreiben (`resolveTrueValue`), unabhaengig davon, was tatsaechlich gesagt
 * wurde. Das wuerde Hoerensagen in perfekte Beobachtung verwandeln und die
 * ganze Epistemik dieses Kanals aufheben. Der Wissenstransfer laeuft deshalb
 * ausschliesslich ueber die `knowledge`-Effekte unten, nie ueber Phase 2.
 */

import { getAgent } from '../../core/access.js';
import { eventId } from '../../core/ids.js';
import type { AgentId, Effect, InfoId, JsonValue } from '../../core/types.js';
import { deriveToldEntry, statementFor } from '../../information/disclosurePolicy.js';
import { statementInfoId } from '../../information/statements.js';
import { effect } from '../../mutation/effects.js';
import type { ActionCandidate, ActionContext, ActionDef } from '../types.js';
import { OK, reject } from '../types.js';

export const shareInformationAction: ActionDef = {
  type: 'share_information',
  tier: 'social',
  cost: { energy: 0 }, // [ANNAHME]: Reden kostet in v1 keine Energie, anders als Handeln
  cooldown: 0,
  requiresTarget: true,
  allowsStatement: true,

  generate(agent, ctx): ActionCandidate[] {
    const known = (Object.keys(agent.knowledge) as InfoId[]).sort();
    if (known.length === 0) return [];

    // Die zuletzt bestaetigte Ueberzeugung ist die, an die der Agent gerade
    // denkt — deterministisch bei Gleichstand ueber die (bereits sortierte)
    // InfoId.
    const bestInfoId = known.reduce((best, id) => {
      const a = agent.knowledge[id]!;
      const b = agent.knowledge[best]!;
      return a.lastConfirmedRound > b.lastConfirmedRound ? id : best;
    });
    const entry = agent.knowledge[bestInfoId]!;
    const item = ctx.state.infoRegistry[bestInfoId];
    if (!item) return [];

    const statement = statementFor(entry, item, ctx.round, ctx.state.config, 'exact');

    return targetsAt(agent.id, agent.location, ctx).map((target) => ({
      type: 'share_information' as const,
      params: { target: target.id },
      label: `share_information:${target.id}:${bestInfoId}`,
      statement,
    }));
  },

  precondition(action, ctx) {
    const agent = getAgent(ctx.state, action.actorId);
    const targetId = readTarget(action.params);
    if (!targetId) {
      return reject(
        'schema_invalid',
        `share_information ohne gueltigen Parameter target: ${JSON.stringify(action.params)}`,
      );
    }
    if (targetId === agent.id) {
      return reject('target_invalid', 'Ein Agent kann nicht sich selbst etwas mitteilen');
    }
    const target = ctx.state.agents[targetId];
    if (!target) return reject('target_invalid', `Agent ${targetId} existiert nicht`);
    if (!target.alive) return reject('target_invalid', `Agent ${targetId} ist ausgeschieden`);
    if (target.location !== agent.location) {
      return reject('target_invalid', `Agent ${targetId} ist nicht am selben Ort`);
    }

    if (!action.statement) {
      return reject('precondition_failed', 'share_information ohne Statement (Pflichtfeld, Doc 04 §4.1 Nr. 6)');
    }
    // `share_information` legt aktiv etwas offen — eine Verweigerung waere hier
    // sinnlos: wer nichts sagen will, unterlaesst die Aktion.
    if (!statementInfoId(action.statement)) {
      return reject(
        'precondition_failed',
        `share_information mit Statement ohne Infobezug (${action.statement.kind})`,
      );
    }

    return OK;
  },

  resolve(action, ctx) {
    const actor = getAgent(ctx.state, action.actorId);
    const targetId = readTarget(action.params);
    if (!targetId) throw new Error('share_information ohne Parameter target in resolve — Validierung uebersprungen?');
    const target = getAgent(ctx.state, targetId);
    const statement = action.statement;
    if (!statement) throw new Error('share_information ohne Statement in resolve — Validierung uebersprungen?');

    const infoId = statementInfoId(statement);
    if (!infoId) throw new Error('share_information mit infobezugslosem Statement in resolve — Validierung uebersprungen?');

    const item = ctx.state.infoRegistry[infoId];
    const senderEntry = actor.knowledge[infoId];
    if (!item || !senderEntry) {
      throw new Error(`share_information: ${infoId} fehlt in Registry oder eigenem Wissen — Stufe 7 haette das gefangen`);
    }

    const effects: Effect[] = [];

    // Vorhersehbar, weil `resolve` und das nachfolgende `emit()` synchron und
    // ohne fremden Zwischenschritt aufeinanderfolgen (`ActionContext.log`):
    // das erste (und einzige) Event, das dieser Aufruf zurueckgibt, bekommt
    // genau diese Id. Ohne sie waere der neue Eintrag ohne Herkunftsnachweis
    // und `no-omniscience` (Doc 08 §8.4) an ihm nicht mehr pruefbar.
    const thisEventId = eventId(ctx.round, ctx.log.nextSeq);

    // Live gelesen, nicht vom Rundenbeginn: `share_information` ist Klasse 5.
    // Hat das Ziel in dieser Runde schon von jemand anderem gehoert (fruehere
    // Aufloesung, gleiche Klasse), muss `deriveToldEntry` GEGEN DAS vergleichen
    // — sonst gewinnt blind der zuletzt aufgeloeste Effekt statt die hoehere
    // Sicherheit, und die "nicht mit Schwaecherem ueberschreiben"-Regel greift
    // nicht.
    const existingForTarget = ctx.projection.knowledgeEntry(target.id, infoId);

    const newEntry = deriveToldEntry({
      statement,
      senderEntry,
      item,
      round: ctx.round,
      config: ctx.state.config,
      sourceAgent: actor.id,
      sourceEventId: thisEventId,
      existing: existingForTarget,
    });
    if (newEntry) {
      effects.push(effect.knowledge(target.id, newEntry));
    }

    // Ebenso live: der eigene Eintrag koennte sich in dieser Runde bereits
    // geaendert haben (der Sender kann selbst gerade erst von einem Dritten
    // gehoert haben). Aus dem Stand vom Rundenbeginn heraus wuerde dieses
    // Update genau diese frischere Version wieder ueberschreiben.
    const currentSenderEntry = ctx.projection.knowledgeEntry(actor.id, infoId) ?? senderEntry;
    if (!currentSenderEntry.sharedWith.includes(target.id)) {
      effects.push(
        effect.knowledge(actor.id, {
          ...currentSenderEntry,
          sharedWith: [...currentSenderEntry.sharedWith, target.id],
        }),
      );
    }

    return {
      effects,
      events: [
        {
          round: ctx.round,
          type: 'information_shared',
          actorId: actor.id,
          targetId: target.id,
          locationId: actor.location,
          payload: { infoId, kind: statement.kind },
          // Am Ort sichtbar, dass geredet wird — NICHT, worueber (kein infoRef).
          visibility: { scope: 'location', locationId: actor.location },
          infoRefs: [],
        },
      ],
    };
  },
};

function targetsAt(self: AgentId, location: string, ctx: ActionContext) {
  return (Object.keys(ctx.state.agents) as AgentId[])
    .sort()
    .map((id) => ctx.state.agents[id])
    .filter((other) => other && other.alive && other.id !== self && other.location === location)
    .map((other) => other!);
}

function readTarget(params: Record<string, JsonValue>): AgentId | null {
  const value = params['target'];
  return typeof value === 'string' && value.startsWith('agent_') ? (value as AgentId) : null;
}
