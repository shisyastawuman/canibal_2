import { checkClose, extendClock } from './clock';
import { isFacilitator } from './match';
import type { Match, Result } from './types';

export const PREP_CLOCK_MS = 10_000;
export const SPEECH_CLOCK_MS = 50_000;

/** Lowest bid first; ties go to the worse rank (higher number). */
export function speakingOrder(match: {
  nominees: readonly string[];
  players: readonly { email: string; rank: number | null }[];
  bidSpends?: readonly { email: string; spent: number }[] | null | undefined;
}): string[] {
  const spentOf = (email: string) => match.bidSpends?.find((item) => item.email === email)?.spent ?? 0;
  const rankOf = (email: string) => match.players.find((p) => p.email === email)?.rank ?? 0;
  return [...match.nominees].sort((a, b) => spentOf(a) - spentOf(b) || rankOf(b) - rankOf(a));
}

/** Nominees from #1 toward the worst rank. A fired nominee keeps the rank they had. */
export function rankingOrder(match: {
  nominees: readonly string[];
  players: readonly { email: string; rank: number | null; rankWhenFired?: number | null }[];
}): string[] {
  const rankOf = (email: string) => {
    const player = match.players.find((p) => p.email === email);
    return player?.rank ?? player?.rankWhenFired ?? Number.POSITIVE_INFINITY;
  };
  return [...match.nominees].sort((a, b) => rankOf(a) - rankOf(b));
}

/** Facilitator opens the shared 0:30 prep. Requires this round's nominees. */
export function startPrepClock(match: Match, facilitatorId: string, now: number): Result {
  if (!isFacilitator(match, facilitatorId)) return { ok: false, error: 'not_facilitator' };
  if (match.phase !== 'reveal_bid' || match.nominees.length === 0) return { ok: false, error: 'wrong_phase' };
  return {
    ok: true,
    match: { ...match, phase: 'prep', clock: { startedAt: now, deadline: now + PREP_CLOCK_MS } },
  };
}

export function extendPrepClock(match: Match, facilitatorId: string, now: number): Result {
  return extendClock(match, 'prep', facilitatorId, now);
}

/** Closes prep and waits for the facilitator to start the first speech. */
export function closePrep(match: Match, now: number, facilitatorId?: string): Result {
  const check = checkClose(match, 'prep', now, facilitatorId);
  if (!check.ok) return check;
  if (match.nominees.length === 0) return { ok: false, error: 'wrong_phase' };
  return { ok: true, match: { ...match, phase: 'speeches', clock: null, speakerIndex: 0 } };
}

/** Starts the strict 1:00 for the nominee whose turn it is. */
export function startSpeechClock(match: Match, facilitatorId: string, now: number): Result {
  if (!isFacilitator(match, facilitatorId)) return { ok: false, error: 'not_facilitator' };
  if (match.phase !== 'speeches' || match.clock || match.speakerIndex === null || match.nominees.length === 0) {
    return { ok: false, error: 'wrong_phase' };
  }
  if (match.speakerIndex < 0 || match.speakerIndex >= match.nominees.length) {
    return { ok: false, error: 'wrong_phase' };
  }
  return {
    ok: true,
    match: { ...match, clock: { startedAt: now, deadline: now + SPEECH_CLOCK_MS } },
  };
}

export function extendSpeechClock(match: Match, facilitatorId: string, now: number): Result {
  return extendClock(match, 'speeches', facilitatorId, now);
}

/**
 * Closes the current minute. The next nominee waits for a new clock.
 * After the last nominee, the match enters `facilitator_bonus`.
 */
export function closeSpeech(match: Match, now: number, facilitatorId?: string): Result {
  const check = checkClose(match, 'speeches', now, facilitatorId);
  if (!check.ok) return check;
  const index = match.speakerIndex ?? 0;
  if (index + 1 < match.nominees.length) {
    return { ok: true, match: { ...match, clock: null, speakerIndex: index + 1 } };
  }
  return {
    ok: true,
    match: { ...match, phase: 'facilitator_bonus', clock: null, speakerIndex: null, facilitatorBonus: null },
  };
}
