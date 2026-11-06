import { checkClose, extendClock } from './clock';
import { findPlayer, isFacilitator } from './match';
import { compactRanks, moveUp } from './rank';
import { rulesOf } from './rewards';
import { survivorsThisRound } from './schedule';
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

export const VOTE_CLOCK_MS = 2 * 60_000;

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
  if (total > rulesOf(match).facilitatorBonusTokens) return { ok: false, error: 'invalid_bonus' };

  const kept = allocation.filter((a) => a.tokens > 0);
  return { ok: true, match: { ...match, facilitatorBonus: kept } };
}

/** Facilitator starts the 3:00 clock; this opens `vote` and hands out this round's free tokens. */
export function startVoteClock(match: Match, facilitatorId: string, now: number): Result {
  if (!isFacilitator(match, facilitatorId)) return { ok: false, error: 'not_facilitator' };
  if (match.phase !== 'facilitator_bonus') return { ok: false, error: 'wrong_phase' };

  const rules = rulesOf(match);
  return {
    ok: true,
    match: {
      ...match,
      phase: 'vote',
      clock: { startedAt: now, deadline: now + VOTE_CLOCK_MS },
      players: match.players.map((p) => ({
        ...p,
        votes: [],
        freeTokens: p.status === 'fired' ? rules.freeTokensForFiredVoters : match.nominees.includes(p.email) ? 0 : rules.freeTokensForActiveVoters,
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
  for (const a of allocation) {
    if (!match.nominees.includes(a.nominee) || seen.has(a.nominee) || !isCount(a.tokens)) {
      return { ok: false, error: 'invalid_vote' };
    }
    seen.add(a.nominee);
    tokens += a.tokens;
  }
  if (tokens > voter.tokens + voter.freeTokens) return { ok: false, error: 'vote_exceeds_tokens' };

  const votes = allocation.filter((a) => a.tokens > 0).map((a) => ({ ...a }));
  return {
    ok: true,
    match: { ...match, players: match.players.map((p) => (p.email === voter.email ? { ...p, votes } : p)) },
  };
}

function placed(player: PlayerInMatch): number {
  return player.votes.reduce((sum, vote) => sum + vote.tokens, 0);
}

/** Free tokens cover the vote before any influence token is spent. */
function influenceSpent(player: PlayerInMatch): number {
  return Math.max(0, placed(player) - player.freeTokens);
}

function unusedFreeTokens(player: PlayerInMatch): number {
  return Math.max(0, player.freeTokens - placed(player));
}

function invested(player: PlayerInMatch, nominee: string): number {
  return player.votes.find((a) => a.nominee === nominee)?.tokens ?? 0;
}

/** Totals ordered first to last; equal totals favor the better rank (lower number). */
export function tallyVotes(match: Match): NomineeTotal[] {
  const rankOf = (email: string) => findPlayer(match, email)?.rank ?? Infinity;
  return match.nominees
    .map((nominee) => {
      let tokens = 0;
      for (const p of match.players) {
        const v = p.votes.find((a) => a.nominee === nominee);
        if (v) tokens += v.tokens;
      }
      const bonus = match.facilitatorBonus?.find((b) => b.nominee === nominee)?.tokens ?? 0;
      return { nominee, tokens, bonus, total: tokens + bonus };
    })
    .sort((a, b) => b.total - a.total || rankOf(a.nominee) - rankOf(b.nominee));
}

function computeAwards(match: Match, survivors: string[], voters: PlayerInMatch[]): TokenAward[] {
  const rules = rulesOf(match);
  const awards: TokenAward[] = [];
  for (const survivor of survivors) {
    awards.push({ email: survivor, amount: rules.survivorInfluenceTokens, reason: 'survivor_reward', survivor });
    const backers = voters.filter((v) => invested(v, survivor) > 0);
    for (const v of backers) {
      awards.push({ email: v.email, amount: invested(v, survivor) + rules.extraTokensForVotingASurvivor, reason: 'vote_refund', survivor });
    }
    const top = Math.max(0, ...backers.map((v) => invested(v, survivor)));
    for (const v of backers.filter((b) => invested(b, survivor) === top)) {
      awards.push({ email: v.email, amount: rules.extraTokensForTopVoter, reason: 'top_voter', survivor });
    }
  }
  return awards;
}

/**
 * Closes `vote`, publishes totals / vote spends / planned awards, and clears live
 * ballots. Does not fire players or change tokens — that happens in `assignRewards`.
 */
export function closeVote(match: Match, now: number, facilitatorId?: string): Result {
  const check = checkClose(match, 'vote', now, facilitatorId);
  if (!check.ok) return check;

  const rules = rulesOf(match);
  const totals = tallyVotes(match);
  const active = match.players.filter((p) => p.status === 'active').length;
  const keep = survivorsThisRound(active, totals.length, rules);
  const survivors = totals.slice(0, keep).map((t) => t.nominee);
  const fired = totals.slice(keep).map((t) => t.nominee);
  const voters = match.players.filter((p) => p.votes.length > 0);
  const ballots: Ballot[] = match.players.map((p) => ({
    email: p.email,
    votes: p.votes.map((v) => ({ ...v })),
    unusedFreeTokens: unusedFreeTokens(p),
    influenceSpent: influenceSpent(p),
  }));
  const voteSpends = match.players
    .map((p) => ({ email: p.email, spent: influenceSpent(p) }))
    .filter((item) => item.spent > 0);
  const awards = computeAwards(match, survivors, voters);

  return {
    ok: true,
    match: {
      ...match,
      phase: 'reveal_vote',
      clock: null,
      voteSpends,
      players: match.players.map((p) => ({ ...p, votes: [], freeTokens: 0 })),
      results: { totals, survivors, fired, awards, ballots },
    },
  };
}

/**
 * Applies vote spends, firings, rank moves and awards. Moves `reveal_vote` → `round_end`.
 */
export function assignRewards(match: Match, facilitatorId: string): Result {
  if (!isFacilitator(match, facilitatorId)) return { ok: false, error: 'not_facilitator' };
  if (match.phase !== 'reveal_vote' || !match.results) return { ok: false, error: 'wrong_phase' };

  const rules = rulesOf(match);
  const { survivors, fired, awards, ballots } = match.results;
  const spentOf = (email: string) => ballots.find((b) => b.email === email)?.influenceSpent ?? 0;

  let players: PlayerInMatch[] = match.players.map((p) => {
    const spentPlayer = { ...p, tokens: p.tokens - spentOf(p.email), freeTokens: 0, votes: [] };
    if (!fired.includes(p.email)) return spentPlayer;
    return { ...spentPlayer, status: 'fired' as const, firedInRound: match.round, rankWhenFired: p.rank, rank: null };
  });
  players = compactRanks(players);

  const byHighestRankFirst = [...survivors].sort(
    (a, b) => (players.find((p) => p.email === a)?.rank ?? 0) - (players.find((p) => p.email === b)?.rank ?? 0),
  );
  for (const survivor of byHighestRankFirst) players = moveUp(players, survivor, rules.survivorRankPlaces);

  players = players.map((p) => ({
    ...p,
    tokens: p.tokens + awards.filter((a) => a.email === p.email).reduce((sum, a) => sum + a.amount, 0),
  }));

  return {
    ok: true,
    match: {
      ...match,
      phase: 'round_end',
      players,
    },
  };
}
