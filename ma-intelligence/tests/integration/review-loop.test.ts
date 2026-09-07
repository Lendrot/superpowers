/**
 * Der Loop von aussen: Mock-Reviewer, Zustandsmaschine und Audit Trail im
 * Zusammenspiel. Diese Tests spielen die Faelle durch, die im Betrieb wehtun.
 */

import { describe, expect, it } from 'vitest';

import { MAX_REVIEW_ATTEMPTS_PER_ROUND, MAX_REVIEW_ROUNDS, REVIEW_CONTRACT_VERSION } from '@/review/contract.js';
import { decideNextAction } from '@/review/loop.js';
import type { LoopAction } from '@/review/loop.js';
import { createMockProvider, emptyReviewPayload } from '@/review/mock-provider.js';
import type { RoundRecord } from '@/review/rounds.js';
import { requestReview } from '@/review/run.js';
import { finding, fixRecord, NOW, payload, reviewRequest, testRun, verdict } from '../fixtures/review.js';

/**
 * Faehrt den Loop, bis er auf einen Menschen wartet oder fertig ist. Die
 * Fix-Runde wird hier stumpf simuliert: jedes Finding angenommen, Tests gruen.
 */
async function driveLoop(responses: readonly string[], maxSteps = 12): Promise<{
  action: LoopAction;
  rounds: RoundRecord[];
  steps: number;
}> {
  const provider = createMockProvider({ responses });
  const rounds: RoundRecord[] = [];
  let action = decideNextAction({ rounds, ci: 'passing', baseline_test_run: testRun() });
  let steps = 0;

  while (steps < maxSteps) {
    steps += 1;
    // Festhalten, bevor `await` die Verengung von `action` verliert.
    const step = action;
    if (step.type === 'REQUEST_REVIEW') {
      const attempt = await requestReview(provider, reviewRequest({ round: step.round }), NOW);
      const existing = rounds.find((entry) => entry.round === step.round);
      if (existing === undefined) {
        rounds.push({ round: step.round, review_attempts: [attempt], fix: null });
      } else {
        existing.review_attempts.push(attempt);
      }
    } else if (step.type === 'APPLY_FIXES') {
      const target = rounds.find((entry) => entry.round === step.round);
      if (target === undefined) throw new Error('Runde fehlt');
      target.fix = fixRecord({
        verdicts: [...step.actionable, ...step.needs_human_triage].map((entry) =>
          verdict({ finding_id: entry.finding_id }),
        ),
      });
    } else {
      break;
    }
    action = decideNextAction({ rounds, ci: 'passing', baseline_test_run: testRun() });
  }

  return { action, rounds, steps };
}

describe('Erfolgreiche Fix-Runde', () => {
  it('endet nach einem sauberen Folge-Review beim Menschen, nicht beim Merge', async () => {
    const { action, rounds } = await driveLoop([
      payload([finding({ finding_id: 'ARCH-001' })]),
      emptyReviewPayload(REVIEW_CONTRACT_VERSION),
    ]);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]?.fix?.verdicts).toHaveLength(1);
    expect(action).toEqual({ type: 'READY_FOR_HUMAN_MERGE' });
  });
});

describe('MAX_REVIEW_ROUNDS im Vollbetrieb', () => {
  it('haelt nach drei Runden an, auch wenn der Reviewer weiter Findings liefert', async () => {
    const endless = [
      payload([finding({ finding_id: 'ARCH-001' })]),
      payload([finding({ finding_id: 'ARCH-002' })]),
      payload([finding({ finding_id: 'ARCH-003' })]),
      payload([finding({ finding_id: 'ARCH-004' })]),
      payload([finding({ finding_id: 'ARCH-005' })]),
    ];
    const { action, rounds } = await driveLoop(endless);
    expect(rounds).toHaveLength(MAX_REVIEW_ROUNDS);
    expect(action.type).toBe('HUMAN_REVIEW_REQUIRED');
    if (action.type === 'HUMAN_REVIEW_REQUIRED') expect(action.reason).toBe('max_review_rounds_reached');
  });

  it('laeuft nicht endlos, wenn der Reviewer dauerhaft Muell liefert', async () => {
    const { action, rounds } = await driveLoop(['kein JSON', 'immer noch kein JSON', 'weiterhin nicht']);
    expect(action.type).toBe('HUMAN_REVIEW_REQUIRED');
    if (action.type === 'HUMAN_REVIEW_REQUIRED') expect(action.reason).toBe('reviewer_response_unusable');
    // Genau ein Wiederholungsversuch, dann uebernimmt ein Mensch.
    expect(rounds).toHaveLength(1);
    expect(rounds[0]?.review_attempts).toHaveLength(MAX_REVIEW_ATTEMPTS_PER_ROUND);
  });
});

describe('Findings mit niedriger Confidence', () => {
  it('reicht sie an die menschliche Triage weiter, statt sie umzusetzen', async () => {
    const provider = createMockProvider({
      responses: [payload([finding({ finding_id: 'ARCH-009', confidence: 0.2 })])],
    });
    const attempt = await requestReview(provider, reviewRequest(), NOW);
    const rounds: RoundRecord[] = [{ round: 1, review_attempts: [attempt], fix: null }];
    const action = decideNextAction({ rounds, ci: 'passing', baseline_test_run: testRun() });
    expect(action.type).toBe('APPLY_FIXES');
    if (action.type === 'APPLY_FIXES') {
      expect(action.actionable).toHaveLength(0);
      expect(action.needs_human_triage.map((entry) => entry.finding_id)).toEqual(['ARCH-009']);
    }
  });
});
