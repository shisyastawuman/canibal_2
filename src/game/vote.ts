import { checkClose, extendClock } from './clock';
import { findPlayer, isFacilitator } from './match';
import { compactRanks, moveUp } from './rank';
import type {
  Ballot,
  BonusAllocation,
  Match,
  NomineeTotal,
  PlayerInMatch,
  Result,
  TokenAward,
  VoteAllocation,
} from './types';

export const VOTE_CLOCK_MS = 3 * 60_000;
export const FACILITATOR_BONUS_MAX = 5;
export const SPECIAL_TOKENS_ACTIVE = 1;
export const SPECIAL_TOKENS_FIRED = 3;
export const SURVIVOR_COUNT = 2;
export const SURVIVOR_RANK_PLACES = 2;
export const SURVIVOR_TOKENS = 3;
export const VOTER_EXTRA_TOKENS = 2;
export const TOP_VOTER_TOKENS = 1;

const isCount = (n: number) => Number.isInteger(n) && n >= 0;


/** Up to 5 tokens, split freely among the nominees. An empty allocation means skipped. */
export function assignFacilitatorBonus(match: Match, facilitatorId: string, allocation: BonusAllocation[]): Result {
  if (!isFacilitator(match, facilitatorId)) return { ok: false, error: 'not_facilitator' };
  if (match.phase !== 'facilitator_bonus') return { ok: false, error: 'wrong_phase' };

  const seen = new Set<string>();
  let total = 0;
  for (const { nominee, tokens } of allocation) {
    if (!match.nominees.includes(nominee) || seen.has(nominee) || !isCount(tokens)) {
      return { ok: false, error: 'invalid_bonus' };
    }
    seen.add(nominee);
    total += tokens;
  }
  if (total > FACILITATOR_BONUS_MAX) return { ok: false, error: 'invalid_bonus' };

  const kept = allocation.filter((a) => a.tokens > 0);
  return { ok: true, match: { ...match, facilitatorBonus: kept } };
}

/** Facilitator starts the 3:00 clock; this opens `vote` and hands out this round's special tokens. */
export function startVoteClock(match: Match, facilitatorId: string, now: number): Result {
  if (!isFacilitator(match, facilitatorId)) return { ok: false, error: 'not_facilitator' };
  if (match.phase !== 'facilitator_bonus') return { ok: false, error: 'wrong_phase' };

  return {
    ok: true,
    match: {
      ...match,
      phase: 'vote',
      clock: { startedAt: now, deadline: now + VOTE_CLOCK_MS },
      players: match.players.map((p) => ({
        ...p,
        votes: [],
        specialTokens:
          p.status === 'fired' ? SPECIAL_TOKENS_FIRED : match.nominees.includes(p.email) ? 0 : SPECIAL_TOKENS_ACTIVE,
      })),
    },
  };
}

export function extendVoteClock(match: Match, facilitatorId: string, now: number): Result {
  return extendClock(match, 'vote', facilitatorId, now);
}

/** The latest allocation for an email replaces the previous one. */
export function setVote(match: Match, email: string, allocation: VoteAllocation[], now: number): Result {
  if (match.phase !== 'vote' || !match.clock) return { ok: false, error: 'wrong_phase' };
  if (now >= match.clock.deadline) return { ok: false, error: 'clock_expired' };

  const voter = findPlayer(match, email);
  if (!voter) return { ok: false, error: 'unknown_player' };
  if (match.nominees.includes(voter.email)) return { ok: false, error: 'nominee_cannot_vote' };

  const seen = new Set<string>();
  let tokens = 0;
  let specialTokens = 0;
  for (const a of allocation) {
    if (!match.nominees.includes(a.nominee) || seen.has(a.nominee) || !isCount(a.tokens) || !isCount(a.specialTokens)) {
      return { ok: false, error: 'invalid_vote' };
    }
    seen.add(a.nominee);
    tokens += a.tokens;
    specialTokens += a.specialTokens;
  }
  if (tokens > voter.tokens) return { ok: false, error: 'vote_exceeds_tokens' };
  if (specialTokens > voter.specialTokens) return { ok: false, error: 'vote_exceeds_special_tokens' };

  const votes = allocation.filter((a) => a.tokens + a.specialTokens > 0).map((a) => ({ ...a }));
  return {
    ok: true,
    match: { ...match, players: match.players.map((p) => (p.email === voter.email ? { ...p, votes } : p)) },
  };
}

function invested(player: PlayerInMatch, nominee: string): number {
  const v = player.votes.find((a) => a.nominee === nominee);
  return v ? v.tokens + v.specialTokens : 0;
}

/** Totals ordered first to last; equal totals favor the better rank (lower number). */
export function tallyVotes(match: Match): NomineeTotal[] {
  const rankOf = (email: string) => findPlayer(match, email)?.rank ?? Infinity;
  return match.nominees
    .map((nominee) => {
      let tokens = 0;
      let specialTokens = 0;
      for (const p of match.players) {
        const v = p.votes.find((a) => a.nominee === nominee);
        if (v) {
          tokens += v.tokens;
          specialTokens += v.specialTokens;
        }
      }
      const bonus = match.facilitatorBonus?.find((b) => b.nominee === nominee)?.tokens ?? 0;
      return { nominee, tokens, specialTokens, bonus, total: tokens + specialTokens + bonus };
    })
    .sort((a, b) => b.total - a.total || rankOf(a.nominee) - rankOf(b.nominee));
}

/**
 * Closes `vote` and applies section 4.6 in order: spend the allocations and
 * drop unused special tokens, fire everyone outside the top 2 and compact
 * the ranking, promote survivors (lowest ranked first), then pay survivors
 * and their voters. Moves to `reveal_vote`.
 */
export function closeVote(match: Match, now: number, facilitatorId?: string): Result {
  const check = checkClose(match, 'vote', now, facilitatorId);
  if (!check.ok) return check;

  const totals = tallyVotes(match);
  const survivors = totals.slice(0, SURVIVOR_COUNT).map((t) => t.nominee);
  const fired = totals.slice(SURVIVOR_COUNT).map((t) => t.nominee);
  const voters = match.players.filter((p) => p.votes.length > 0);
  const ballots: Ballot[] = match.players.map((p) => ({
    email: p.email,
    votes: p.votes.map((v) => ({ ...v })),
    unusedSpecialTokens: p.specialTokens - p.votes.reduce((sum, v) => sum + v.specialTokens, 0),
  }));

  let players: PlayerInMatch[] = match.players.map((p) => {
    const spent = p.votes.reduce((sum, v) => sum + v.tokens, 0);
    const spentPlayer = { ...p, tokens: p.tokens - spent, specialTokens: 0, votes: [] };
    if (!fired.includes(p.email)) return spentPlayer;
    return { ...spentPlayer, status: 'fired' as const, firedInRound: match.round, rankWhenFired: p.rank, rank: null };
  });
  players = compactRanks(players);

  const byLowestRankFirst = [...survivors].sort(
    (a, b) => (players.find((p) => p.email === b)?.rank ?? 0) - (players.find((p) => p.email === a)?.rank ?? 0),
  );
  for (const survivor of byLowestRankFirst) players = moveUp(players, survivor, SURVIVOR_RANK_PLACES);

  const awards: TokenAward[] = [];
  for (const survivor of survivors) {
    awards.push({ email: survivor, amount: SURVIVOR_TOKENS, reason: 'survivor_reward', survivor });
    const backers = voters.filter((v) => invested(v, survivor) > 0);
    for (const v of backers) {
      awards.push({ email: v.email, amount: invested(v, survivor) + VOTER_EXTRA_TOKENS, reason: 'vote_refund', survivor });
    }
    const top = Math.max(0, ...backers.map((v) => invested(v, survivor)));
    for (const v of backers.filter((b) => invested(b, survivor) === top)) {
      awards.push({ email: v.email, amount: TOP_VOTER_TOKENS, reason: 'top_voter', survivor });
    }
  }
  players = players.map((p) => ({
    ...p,
    tokens: p.tokens + awards.filter((a) => a.email === p.email).reduce((sum, a) => sum + a.amount, 0),
  }));

  return {
    ok: true,
    match: {
      ...match,
      phase: 'reveal_vote',
      clock: null,
      players,
      results: { totals, survivors, fired, awards, ballots },
    },
  };
}
