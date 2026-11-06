import { checkClose, extendClock } from './clock';
import { findPlayer, isFacilitator } from './match';
import { rulesOf } from './rewards';
import { nomineeCount } from './schedule';
import type { BidSpend, Match, PlayerInMatch, Result } from './types';

export const BID_CLOCK_MS = 2 * 60_000;

/** Facilitator starts the 3:00 clock; this opens `immunity_bid`. */
export function startBidClock(match: Match, facilitatorId: string, now: number): Result {
  if (!isFacilitator(match, facilitatorId)) return { ok: false, error: 'not_facilitator' };
  if (match.phase !== 'reveal_prompt') return { ok: false, error: 'wrong_phase' };

  return {
    ok: true,
    match: {
      ...match,
      phase: 'immunity_bid',
      clock: { startedAt: now, deadline: now + BID_CLOCK_MS },
      players: match.players.map((p) => ({ ...p, immunityBid: 0 })),
    },
  };
}

export function extendBidClock(match: Match, facilitatorId: string, now: number): Result {
  return extendClock(match, 'immunity_bid', facilitatorId, now);
}

/** The latest submission for an email replaces the previous one. */
export function setImmunityBid(match: Match, email: string, amount: number, now: number): Result {
  if (match.phase !== 'immunity_bid' || !match.clock) return { ok: false, error: 'wrong_phase' };
  if (now >= match.clock.deadline) return { ok: false, error: 'clock_expired' };

  const player = findPlayer(match, email);
  if (!player) return { ok: false, error: 'unknown_player' };
  if (player.status !== 'active') return { ok: false, error: 'not_active' };
  if (!Number.isInteger(amount) || amount < 0) return { ok: false, error: 'invalid_bid' };
  if (amount > player.tokens) return { ok: false, error: 'bid_exceeds_tokens' };

  return {
    ok: true,
    match: {
      ...match,
      players: match.players.map((p) => (p.email === player.email ? { ...p, immunityBid: amount } : p)),
    },
  };
}

/** The `count` lowest spenders; ties go to the lower rank (higher number). */
export function selectNominees(active: PlayerInMatch[], count: number): string[] {
  return [...active]
    .sort((a, b) => a.immunityBid - b.immunityBid || (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, count)
    .map((p) => p.email);
}

/**
 * Closes `immunity_bid`: spends every selection, picks the nominees and moves
 * to `reveal_bid`. Before the deadline only the facilitator may close it.
 */
export function closeImmunityBid(match: Match, now: number, facilitatorId?: string): Result {
  const check = checkClose(match, 'immunity_bid', now, facilitatorId);
  if (!check.ok) return check;
  if (match.rosterSize === null) return { ok: false, error: 'wrong_phase' };

  const active = match.players.filter((p) => p.status === 'active');
  const nominees = selectNominees(active, nomineeCount(match.rosterSize, match.round, rulesOf(match)));
  const bidSpends: BidSpend[] = active.map((p) => ({ email: p.email, spent: p.immunityBid }));

  return {
    ok: true,
    match: {
      ...match,
      phase: 'reveal_bid',
      clock: null,
      nominees,
      bidSpends,
      players: match.players.map((p) =>
        p.status === 'active' ? { ...p, tokens: p.tokens - p.immunityBid, immunityBid: 0 } : p,
      ),
    },
  };
}
