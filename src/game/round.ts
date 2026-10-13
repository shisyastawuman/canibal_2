import { isFacilitator } from './match';
import { roundCount } from './schedule';
import type { Match, Result } from './types';
import { declareVictory } from './victory';

export function endRound(match: Match, facilitatorId: string): Result {
  if (!isFacilitator(match, facilitatorId)) return { ok: false, error: 'not_facilitator' };
  if (match.phase !== 'reveal_vote') return { ok: false, error: 'wrong_phase' };
  return { ok: true, match: { ...match, phase: 'round_end' } };
}

/**
 * From `round_end`, opens the next prompt. When the schedule is over, or two
 * active players remain, the match moves to `victory` instead.
 */
export function startNextRound(match: Match, facilitatorId: string): Result {
  if (!isFacilitator(match, facilitatorId)) return { ok: false, error: 'not_facilitator' };
  if (match.phase !== 'round_end' || match.rosterSize === null) return { ok: false, error: 'wrong_phase' };

  const active = match.players.filter((p) => p.status === 'active').length;
  if (match.round >= roundCount(match.rosterSize) || active <= 2) {
    return { ok: true, match: declareVictory(match) };
  }

  return {
    ok: true,
    match: {
      ...match,
      phase: 'reveal_prompt',
      round: match.round + 1,
      prompt: match.promptOrder[match.round] ?? null,
      nominees: [],
      bidSpends: null,
      facilitatorBonus: null,
      results: null,
      speakerIndex: null,
    },
  };
}
