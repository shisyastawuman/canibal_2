import { isFacilitator } from './match';
import type { Match, Phase, Result } from './types';

export const CLOCK_INCREMENT_MS = 30_000;

export function extendClock(match: Match, phase: Phase, facilitatorId: string, now: number): Result {
  if (!isFacilitator(match, facilitatorId)) return { ok: false, error: 'not_facilitator' };
  if (match.phase !== phase || !match.clock) return { ok: false, error: 'wrong_phase' };
  if (now >= match.clock.deadline) return { ok: false, error: 'clock_expired' };

  return {
    ok: true,
    match: { ...match, clock: { ...match.clock, deadline: match.clock.deadline + CLOCK_INCREMENT_MS } },
  };
}

/** Before the deadline only the facilitator may close a clocked phase. */
export function checkClose(match: Match, phase: Phase, now: number, facilitatorId?: string): Result {
  if (match.phase !== phase || !match.clock) return { ok: false, error: 'wrong_phase' };
  if (facilitatorId !== undefined && !isFacilitator(match, facilitatorId)) {
    return { ok: false, error: 'not_facilitator' };
  }
  if (now < match.clock.deadline && facilitatorId === undefined) {
    return { ok: false, error: 'clock_still_running' };
  }
  return { ok: true, match };
}
