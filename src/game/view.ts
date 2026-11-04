import { findPlayer, normalizeEmail } from './match';
import type { BidSpend, BonusAllocation, Clock, Match, Phase, PlayerInMatch, Prompt, VoteResults, Winner } from './types';

export type OtherPlayer = Omit<PlayerInMatch, 'immunityBid' | 'votes'>;

export interface PlayerView extends Omit<Match, 'players' | 'facilitatorId'> {
  players: OtherPlayer[];
  /** The requesting player, including their own current selection. */
  me: PlayerInMatch | null;
}

/** What one player's phone may receive. Other players' bids, votes and ballots are never included. */
export function viewForPlayer(match: Match, email: string): PlayerView {
  const key = normalizeEmail(email);
  const { facilitatorId: _hidden, players, results, ...rest } = match;
  return {
    ...rest,
    results: results && {
      ...results,
      ballots: results.ballots.filter((b) => b.email === key),
    },
    players: players.map(({ immunityBid: _bid, votes: _votes, ...p }) => p),
    me: findPlayer(match, email) ?? null,
  };
}

export interface PublicPlayer {
  name: string;
  email: string;
  status: 'active' | 'fired';
  rank: number | null;
  rankWhenFired: number | null;
  tokens: number;
}

export type PublicResults = Omit<VoteResults, 'ballots'>;

export interface PublicView {
  code: string;
  phase: Phase;
  round: number;
  prompt: Prompt | null;
  clock: Clock | null;
  instructions: string | null;
  players: PublicPlayer[] | null;
  nominees: string[] | null;
  bidSpends: BidSpend[] | null;
  facilitatorBonus: BonusAllocation[] | null;
  results: PublicResults | null;
  winners: Winner[] | null;
  rosterSize: number | null;
  speakerIndex: number | null;
}

const BID_INSTRUCTIONS = 'Puja por inmunidad en curso. Las pujas se revelan cuando cierre el reloj.';
const VOTE_INSTRUCTIONS = 'Votación en curso. Los votos se revelan cuando cierre el reloj.';

function publicPlayers(match: Match): PublicPlayer[] {
  return match.players.map((p) => ({
    name: p.name,
    email: p.email,
    status: p.status,
    rank: p.rank,
    rankWhenFired: p.rankWhenFired,
    tokens: p.tokens,
  }));
}

/**
 * Outside a secret phase the room screen gets the ranking, the prompt and the
 * published results. During `immunity_bid` and `vote` it gets only the clock
 * and the instructions for that phase.
 */
export function viewForPublic(match: Match): PublicView {
  const secret = match.phase === 'immunity_bid' || match.phase === 'vote';
  if (secret) {
    return {
      code: match.code,
      phase: match.phase,
      round: match.round,
      prompt: match.phase === 'immunity_bid' ? match.prompt : null,
      clock: match.clock,
      instructions: match.phase === 'immunity_bid' ? BID_INSTRUCTIONS : VOTE_INSTRUCTIONS,
      players: null,
      nominees: null,
      bidSpends: null,
      facilitatorBonus: null,
      results: null,
      winners: null,
      rosterSize: match.rosterSize,
      speakerIndex: null,
    };
  }

  const { ballots: _ballots, ...results } = match.results ?? { totals: [], survivors: [], fired: [], awards: [], ballots: [] };
  return {
    code: match.code,
    phase: match.phase,
    round: match.round,
    prompt: match.prompt,
    clock: match.clock,
    instructions: null,
    players: publicPlayers(match),
    nominees: match.nominees,
    bidSpends: match.bidSpends,
    facilitatorBonus: match.facilitatorBonus,
    results: match.results ? results : null,
    winners: match.winners,
    rosterSize: match.rosterSize,
    speakerIndex: match.speakerIndex,
  };
}
