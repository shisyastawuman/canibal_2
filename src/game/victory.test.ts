import { describe, expect, it } from 'vitest';
import { createMatch } from './match';
import type { Match, PlayerInMatch } from './types';
import { firedWinnerSeats } from './rewards';
import { declareVictory, pickWinners, rankFiredForVictory, toHistoryEntry } from './victory';

function fired(email: string, tokens: number, round: number, rank: number): PlayerInMatch {
  return {
    name: email,
    email,
    status: 'fired',
    rank: null,
    tokens,
    freeTokens: 4,
    immunityBid: 0,
    votes: [],
    firedInRound: round,
    rankWhenFired: rank,
  };
}

function active(email: string, rank: number, tokens = 5): PlayerInMatch {
  return {
    name: email,
    email,
    status: 'active',
    rank,
    tokens,
    freeTokens: 0,
    immunityBid: 0,
    votes: [],
    firedInRound: null,
    rankWhenFired: null,
  };
}

describe('victory (US-6.1)', () => {
  it('adds 1, 2 or 3 fired winners so the podium stays between 3 and 5', () => {
    expect(firedWinnerSeats(7)).toBe(1);
    expect(firedWinnerSeats(24)).toBe(1);
    expect(firedWinnerSeats(25)).toBe(2);
    expect(firedWinnerSeats(42)).toBe(2);
    expect(firedWinnerSeats(43)).toBe(3);
    expect(firedWinnerSeats(60)).toBe(3);
  });

  it('orders fired players by tokens, then later round, then better rank at firing', () => {
    const players = [
      fired('low@x.com', 4, 5, 1),
      fired('tie-early@x.com', 10, 1, 2),
      fired('tie-late-worse@x.com', 10, 3, 8),
      fired('tie-late-better@x.com', 10, 3, 3),
      fired('rich@x.com', 11, 1, 9),
    ];
    expect(rankFiredForVictory(players).map((p) => p.email)).toEqual([
      'rich@x.com',
      'tie-late-better@x.com',
      'tie-late-worse@x.com',
      'tie-early@x.com',
      'low@x.com',
    ]);
  });

  it('keeps the two active players and ignores free tokens', () => {
    const players = [active('first@x.com', 1, 3), active('second@x.com', 2, 9), fired('star@x.com', 8, 2, 4), fired('other@x.com', 8, 1, 1)];
    const match: Match = { ...createMatch([], () => 0), rosterSize: 7, players };
    expect(pickWinners(match)).toEqual([
      { email: 'first@x.com', kind: 'active' },
      { email: 'second@x.com', kind: 'active' },
      { email: 'star@x.com', kind: 'fired' },
    ]);
    const done = declareVictory(match);
    expect(done.phase).toBe('victory');
    expect(toHistoryEntry(done, 50).winners.map((w) => w.email)).toEqual(['first@x.com', 'second@x.com', 'star@x.com']);
  });
});
