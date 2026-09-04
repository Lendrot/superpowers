/**
 * Oeffentliche Engine-API.
 *
 * Alles ausserhalb von `src/engine/**` (CLI, spaeter Server und UI) importiert
 * ausschliesslich von hier. Was nicht exportiert ist, ist Interna.
 */

export { DEFAULT_CONFIG, DEFAULT_ECONOMY, resolveConfig } from './core/config.js';
export type { MatchConfigInput } from './core/config.js';
export { createEventLog, hashEvents } from './core/eventLog.js';
export type { EventDraft, EventLog } from './core/eventLog.js';
export { canonicalJson, hashString, hashValue } from './core/hash.js';
export { agentId, agentIndex, eventId, matchId } from './core/ids.js';
export { InvariantError, assertInvariants, totalResources } from './core/invariants.js';
export { createRngBundle, streamKey } from './core/rng.js';
export type { Rng, RngBundle } from './core/rng.js';
export { RESOURCE_KINDS } from './core/resources.js';
export { agentIds, aliveAgents, getAgent, getLocation, occupantsOf } from './core/access.js';
export * from './core/types.js';

export { ARCHETYPES, ARCHETYPE_IDS } from './agents/archetypes.js';
export { IMPLEMENTED_ACTIONS, findAction, isImplemented, requireAction } from './actions/registry.js';
export { actionClassOf, initiativeOf, orderActions } from './actions/resolutionOrder.js';
export type { ActionCandidate, ActionContext, ActionDef } from './actions/types.js';

export { generateCandidates } from './decision/candidates.js';
export { policyProvider } from './decision/policyProvider.js';
export type { Decision, DecisionContext, DecisionProvider, ScoredCandidate } from './decision/provider.js';

export { effect, describeEffect, expectedResourceDelta } from './mutation/effects.js';
export { applyEffects } from './mutation/stateMutator.js';

export { EffectProjection, validateAction } from './validation/validateAction.js';
export { REJECT_REASONS, emptyRejectCounts, totalRejects } from './validation/rejectReasons.js';
export type { RejectCounts } from './validation/rejectReasons.js';

export { initWorld } from './world/initWorld.js';
export { LOCATION_IDS, createLocations } from './world/locations.js';
export { upkeep } from './world/upkeep.js';
export { perceptionEffects, resolveObservers } from './world/perception.js';
export { leaderboard, scoreOfAgent, scoringEffects } from './world/scoring.js';

export { buildAgentView, believedStock } from './agents/agentView.js';
export type { AgentView, BeliefView, PublicAgent, VisibleLocation } from './agents/agentView.js';
export {
  agentResourceInfoId,
  agentResourceInfoItem,
  eventInfoId,
  eventInfoItem,
  resolveTrueValue,
  stockInfoId,
  stockInfoItem,
} from './information/infoRegistry.js';
export {
  OBSERVED_CERTAINTY,
  canAssertAsFact,
  decayPerRound,
  effectiveCertainty,
  observedEntry,
} from './information/knowledge.js';

export { runRound } from './runner/runRound.js';
export type { RoundDeps, RoundResult } from './runner/runRound.js';
export { runMatch } from './runner/runMatch.js';
export type { MatchResult, RunMatchOptions } from './runner/runMatch.js';
export { aggregateLongRun, giniCoefficient, sampleMatch } from './runner/stats.js';
export type { LongRunReport, MatchSample } from './runner/stats.js';
