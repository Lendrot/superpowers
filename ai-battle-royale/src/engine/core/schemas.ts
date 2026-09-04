/**
 * Zod-Schemas (T02, reduziert).
 *
 * Doc 02 §2.6: Zod ist die Single Source of Truth fuer Laufzeitvalidierung und
 * spaeter fuer die JSON-Schemas der Structured Outputs (Doc 14). Solange kein
 * LLM im Spiel ist, hat das Schema genau eine Aufgabe: Stufe 1 der
 * Validierungskette (Doc 08 §8.1) — sie muss auch dann greifen, wenn die Aktion
 * aus der eigenen Policy stammt, sonst ist die Stufe im LLM-Fall ungetestet.
 */

import { z } from 'zod';

import { EVENT_TYPES } from './types.js';

export const agentIdSchema = z
  .string()
  .regex(/^agent_[a-z0-9_]+$/, 'AgentId muss dem Muster agent_<slug> folgen');

export const resourceKindSchema = z.enum(['food', 'coins', 'materials']);

export const actionTypeSchema = z.enum([
  'gather_resource',
  'rest',
  'move',
  'consume',
  'trade',
  'share_information',
  'request_information',
  'offer_alliance',
  'leave_alliance',
  'expel_member',
  'help',
  'investigate',
  'confront',
  'attack',
]);

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)]),
);

export const infoIdSchema = z.string().regex(/^info_/, 'InfoId muss mit info_ beginnen');

export const infoTopicSchema = z.enum([
  'stock_at_location',
  'agent_resource',
  'agent_attribute',
  'agent_alliance',
  'agent_secret_goal',
  'pledge_state',
  'event_occurred',
  'agent_intent_declared',
]);

export const infoValueSchema = z.union([z.number(), z.boolean(), z.string()]);

export const disclosureSchema = z.union([
  z.object({ mode: z.literal('exact'), value: infoValueSchema }),
  z.object({ mode: z.literal('bound'), op: z.enum(['>=', '<=']), value: z.number() }),
  z.object({ mode: z.literal('qualitative'), bucket: z.enum(['none', 'some', 'much']) }),
  z.object({ mode: z.literal('existence_only') }),
]);

/**
 * Doc 03 §3.4.3. Der Truth-Validator (Stufe 7) prueft den Inhalt; hier geht es
 * nur um die Form.
 *
 * Eine Formregel steht trotzdem schon hier: `partial_disclosure` ist laut Doc 03
 * "stets unpraezise", also kann sie keinen exakten Wert tragen. Das als
 * `schema_invalid` in Stufe 1 zu fangen ist richtiger, als es Stufe 7 als
 * Wahrheitsfrage unterzuschieben — der Satz ist nicht unwahr, sondern kein
 * `partial_disclosure`.
 */
export const statementSchema = z.union([
  z.object({ kind: z.literal('assert_fact'), infoId: infoIdSchema, disclosure: disclosureSchema }),
  z.object({ kind: z.literal('assert_absence'), infoId: infoIdSchema }),
  z.object({
    kind: z.literal('belief'),
    infoId: infoIdSchema,
    hedge: z.enum(['i_think', 'not_sure']),
    disclosure: disclosureSchema,
  }),
  z.object({
    kind: z.literal('hearsay'),
    infoId: infoIdSchema,
    sourceAgent: agentIdSchema,
    disclosure: disclosureSchema,
  }),
  z.object({
    kind: z.literal('partial_disclosure'),
    infoId: infoIdSchema,
    disclosure: disclosureSchema.refine(
      (value) => value.mode !== 'exact',
      'partial_disclosure ist stets unpraezise (Doc 03 §3.4.3)',
    ),
  }),
  z.object({ kind: z.literal('refuse_to_answer'), topic: infoTopicSchema }),
  z.object({ kind: z.literal('withhold'), topic: infoTopicSchema }),
  z.object({ kind: z.literal('redirect_conversation'), toTopic: infoTopicSchema }),
  z.object({ kind: z.literal('express_uncertainty'), topic: infoTopicSchema }),
  z.object({ kind: z.literal('declare_intent'), intent: z.string(), pledgeId: z.string().optional() }),
  z.object({ kind: z.literal('none') }),
]);

export const agentActionSchema = z.object({
  actorId: agentIdSchema,
  type: actionTypeSchema,
  params: z.record(jsonValueSchema),
  statement: statementSchema.optional(),
  source: z.enum(['policy', 'llm', 'fallback', 'scripted']),
});

export const visibilitySchema = z.union([
  z.object({ scope: z.literal('public') }),
  z.object({ scope: z.literal('location'), locationId: z.string() }),
  z.object({ scope: z.literal('participants') }),
  z.object({ scope: z.literal('alliance'), allianceId: z.string() }),
  z.object({ scope: z.literal('private'), agentIds: z.array(agentIdSchema) }),
]);

export const worldEventSchema = z.object({
  id: z.string(),
  matchId: z.string(),
  round: z.number().int().min(1),
  seq: z.number().int().min(0),
  type: z.enum(EVENT_TYPES),
  actorId: agentIdSchema.optional(),
  targetId: agentIdSchema.optional(),
  allianceId: z.string().optional(),
  locationId: z.string().nullable(),
  payload: z.record(jsonValueSchema),
  visibility: visibilitySchema,
  infoRefs: z.array(z.string()),
});
