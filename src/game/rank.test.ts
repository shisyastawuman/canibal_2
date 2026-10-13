import { describe, expect, it } from 'vitest';
import { compactRanks, moveUp } from './rank';
import type { PlayerInMatch } from './types';

const player = (email: string, rank: number | null, status: PlayerInMatch['status'] = 'active'): PlayerInMatch => ({
  name: email,
  email,
  status,
  rank,
  tokens: 5,
  specialTokens: 0,
  immunityBid: 0,
  votes: [],
  firedInRound: null,
  rankWhenFired: null,
});

const ranks = (players: PlayerInMatch[]) => Object.fromEntries(players.map((p) => [p.email, p.rank]));

describe('rank (section 4.3)', () => {
  it('moving up 2 pushes each passed player down 1', () => {
    const players = [player('a', 1), player('b', 2), player('c', 3), player('d', 4)];
    expect(ranks(moveUp(players, 'd', 2))).toEqual({ a: 1, b: 3, c: 4, d: 2 });
  });

  it('a move up is capped at #1', () => {
    const players = [player('a', 1), player('b', 2), player('c', 3)];
    expect(ranks(moveUp(players, 'b', 2))).toEqual({ a: 2, b: 1, c: 3 });
    expect(ranks(moveUp(players, 'a', 2))).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('compacting after a firing closes the gap and fired players lose their rank', () => {
    const players = [player('a', 1), player('b', 2, 'fired'), player('c', 3), player('d', 4)];
    expect(ranks(compactRanks(players))).toEqual({ a: 1, b: null, c: 2, d: 3 });
  });
});
