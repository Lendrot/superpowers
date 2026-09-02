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
]);

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)]),
);

export const agentActionSchema = z.object({
  actorId: agentIdSchema,
  type: actionTypeSchema,
  params: z.record(jsonValueSchema),
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
  type: z.enum([
    'match_started',
    'round_started',
    'agent_rested',
    'resource_gathered',
    'gather_failed',
    'action_rejected',
    'round_ended',
    'match_ended',
  ]),
  actorId: agentIdSchema.optional(),
  targetId: agentIdSchema.optional(),
  allianceId: z.string().optional(),
  locationId: z.string().nullable(),
  payload: z.record(jsonValueSchema),
  visibility: visibilitySchema,
  infoRefs: z.array(z.string()),
});
