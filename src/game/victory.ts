import { firedWinnerSeats, rulesOf } from './rewards';
import type { Match, PlayerInMatch, Winner } from './types';

/**
 * More permanent tokens first. Equal tokens: fired later first.
 * Same round: better rank at firing (lower number) first.
 */
export function rankFiredForVictory(players: PlayerInMatch[]): PlayerInMatch[] {
  return players
    .filter((p) => p.status === 'fired')
    .sort((a, b) => {
      if (b.tokens !== a.tokens) return b.tokens - a.tokens;
      const roundA = a.firedInRound ?? 0;
      const roundB = b.firedInRound ?? 0;
      if (roundB !== roundA) return roundB - roundA;
      return (a.rankWhenFired ?? Infinity) - (b.rankWhenFired ?? Infinity);
    });
}

/** The two remaining active players (best rank first), then the fired winners. */
export function pickWinners(match: Match): Winner[] {
  const active = match.players
    .filter((p) => p.status === 'active')
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
    .map((p): Winner => ({ email: p.email, kind: 'active' }));
  const seats = firedWinnerSeats(match.rosterSize ?? match.players.length, rulesOf(match));
  const fired = rankFiredForVictory(match.players)
    .slice(0, seats)
    .map((p): Winner => ({ email: p.email, kind: 'fired' }));
  return [...active, ...fired];
}

export function declareVictory(match: Match): Match {
  return { ...match, phase: 'victory', clock: null, winners: pickWinners(match) };
}

export interface HistoryEntry {
  code: string;
  finishedAt: number;
  rosterSize: number;
  winners: { email: string; name: string; kind: 'active' | 'fired'; tokens: number; rank: number | null }[];
}

export function toHistoryEntry(match: Match, finishedAt: number): HistoryEntry {
  const winners = (match.winners ?? []).map((winner) => {
    const player = match.players.find((p) => p.email === winner.email);
    return {
      email: winner.email,
      name: player?.name ?? winner.email,
      kind: winner.kind,
      tokens: player?.tokens ?? 0,
      rank: player?.rank ?? null,
    };
  });
  return { code: match.code, finishedAt, rosterSize: match.rosterSize ?? match.players.length, winners };
}
