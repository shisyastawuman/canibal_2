import { describe, expect, it } from 'vitest';
import { firingsPerRound, isValidRosterSize, nomineeCount, roundCount } from './schedule';

describe('schedule (section 4.4)', () => {
  it('accepts rosters from 7 to 60 only', () => {
    expect(isValidRosterSize(1)).toBe(false);
    expect(isValidRosterSize(6)).toBe(false);
    expect(isValidRosterSize(7)).toBe(true);
    expect(isValidRosterSize(60)).toBe(true);
    expect(isValidRosterSize(61)).toBe(false);
  });

  it('runs 5 rounds for 7 players, 6 for 8, 7 for 9 or more', () => {
    expect(roundCount(7)).toBe(5);
    expect(roundCount(8)).toBe(6);
    expect(roundCount(9)).toBe(7);
    expect(roundCount(60)).toBe(7);
  });

  it('7 players: fire 1 and nominate 3 on each of 5 rounds', () => {
    expect(firingsPerRound(7)).toEqual([1, 1, 1, 1, 1]);
    expect([1, 2, 3, 4, 5].map((r) => nomineeCount(7, r))).toEqual([3, 3, 3, 3, 3]);
  });

  it('60 players: earlier rounds take the extra firings', () => {
    expect(firingsPerRound(60)).toEqual([9, 9, 8, 8, 8, 8, 8]);
    expect([1, 2, 3, 4, 5, 6, 7].map((r) => nomineeCount(60, r))).toEqual([11, 11, 10, 10, 10, 10, 10]);
  });

  it('always fires P − 2 in total and nominates every active player on the last round', () => {
    for (let p = 7; p <= 60; p++) {
      const firings = firingsPerRound(p);
      expect(firings.reduce((a, b) => a + b, 0)).toBe(p - 2);
      const activeAtLastRound = p - firings.slice(0, -1).reduce((a, b) => a + b, 0);
      expect(nomineeCount(p, firings.length)).toBe(activeAtLastRound);
      for (let r = 1; r < firings.length; r++) {
        const activeBefore = p - firings.slice(0, r - 1).reduce((a, b) => a + b, 0);
        expect(nomineeCount(p, r)).toBeLessThan(activeBefore);
      }
    }
  });
});
