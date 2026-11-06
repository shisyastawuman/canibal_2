import { describe, expect, it } from 'vitest';
import { rewards } from './rewards';
import { firingsPerRound, isValidRosterSize, nomineeCount, nominatesAllActive, roundCount, survivorsThisRound } from './schedule';

describe('schedule (section 4.4)', () => {
  it('accepts rosters from 3 to 60 only', () => {
    expect(isValidRosterSize(1)).toBe(false);
    expect(isValidRosterSize(2)).toBe(false);
    expect(isValidRosterSize(3)).toBe(true);
    expect(isValidRosterSize(60)).toBe(true);
    expect(isValidRosterSize(61)).toBe(false);
  });

  it('runs 5 rounds for 7 players and one more round per extra player', () => {
    expect(roundCount(7)).toBe(5);
    expect(roundCount(8)).toBe(6);
    expect(roundCount(9)).toBe(7);
    expect(roundCount(60)).toBe(58);
  });

  it('7 players: fire 1 and nominate 3 on each of 5 rounds', () => {
    expect(firingsPerRound(7)).toEqual([1, 1, 1, 1, 1]);
    expect([1, 2, 3, 4, 5].map((r) => nomineeCount(7, r))).toEqual([3, 3, 3, 3, 3]);
  });

  it('60 players: one firing and three nominees on every round', () => {
    expect(firingsPerRound(60)).toEqual(Array.from({ length: 58 }, () => 1));
    expect(nomineeCount(60, 1)).toBe(3);
    expect(nomineeCount(60, 58)).toBe(3);
  });

  it('keeps extra survivors on the closing round so the winner count is met', () => {
    const rules = { ...rewards, nomineesPerRound: 3, rewardedSurvivors: 1, activePlayersWhoWin: 2 };
    expect(survivorsThisRound(7, 3, rules)).toBe(1);
    expect(survivorsThisRound(3, 3, rules)).toBe(2);
    expect(firingsPerRound(7, rules)).toEqual([2, 2, 1]);
  });

  it('follows the nominees, survivors and winners set for the match', () => {
    const rules = { ...rewards, nomineesPerRound: 5 };
    expect(roundCount(7, rules)).toBe(2);
    expect(firingsPerRound(7, rules)).toEqual([3, 2]);
    expect(nomineeCount(7, 1, rules)).toBe(5);
    expect(nomineeCount(7, 2, rules)).toBe(4);
    expect(nominatesAllActive(7, 2, rules)).toBe(true);
    expect(nominatesAllActive(7, 1, rules)).toBe(false);
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
