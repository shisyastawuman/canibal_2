import { describe, expect, it } from 'vitest';
import {
  BID_CLOCK_MS,
  closeImmunityBid,
  extendBidClock,
  selectNominees,
  setImmunityBid,
  startBidClock,
} from './bid';
import { createMatch, findPlayer, joinMatch, revealFirstPrompt } from './match';
import { rewards } from './rewards';
import type { Match, PlayerInMatch, Prompt, Result } from './types';
import { viewForPlayer } from './view';

const T0 = 1_000_000;
const prompts: Prompt[] = Array.from({ length: 7 }, (_, i) => ({ id: `p${i + 1}`, text: `Consigna ${i + 1}` }));

function ok(result: Result): Match {
  if (!result.ok) throw new Error(result.error);
  return result.match;
}

/** Player i (1-based) joins with rank i. */
function revealed(count = 7): Match {
  let match = createMatch(prompts, () => 0.5);
  for (let i = 1; i <= count; i++) {
    match = ok(joinMatch(match, `J${i}`, `p${i}@x.com`, () => 0.999999));
  }
  return ok(revealFirstPrompt(match, match.facilitatorId));
}

function bidding(count = 7): Match {
  const match = revealed(count);
  return ok(startBidClock(match, match.facilitatorId, T0));
}

describe('bid clock (US-2.2)', () => {
  it('only the facilitator starts it, from reveal_prompt, for 3:00', () => {
    const match = revealed();
    expect(startBidClock(match, 'nope', T0)).toEqual({ ok: false, error: 'not_facilitator' });
    const started = ok(startBidClock(match, match.facilitatorId, T0));
    expect(started.phase).toBe('immunity_bid');
    expect(started.clock).toEqual({ startedAt: T0, deadline: T0 + BID_CLOCK_MS });
    expect(startBidClock(started, match.facilitatorId, T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('cannot open the bid from lobby', () => {
    const match = createMatch(prompts, () => 0.5);
    expect(startBidClock(match, match.facilitatorId, T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('adds 30 seconds while running, not after it ran out', () => {
    const match = bidding();
    const extended = ok(extendBidClock(match, match.facilitatorId, T0 + 1000));
    expect(extended.clock?.deadline).toBe(T0 + BID_CLOCK_MS + 30_000);
    expect(extendBidClock(match, match.facilitatorId, T0 + BID_CLOCK_MS)).toEqual({
      ok: false,
      error: 'clock_expired',
    });
    expect(extendBidClock(match, 'nope', T0)).toEqual({ ok: false, error: 'not_facilitator' });
  });

  it('only the facilitator may close before the deadline', () => {
    const match = bidding();
    expect(closeImmunityBid(match, T0 + 1000)).toEqual({ ok: false, error: 'clock_still_running' });
    expect(closeImmunityBid(match, T0 + 1000, 'nope')).toEqual({ ok: false, error: 'not_facilitator' });
    expect(ok(closeImmunityBid(match, T0 + 1000, match.facilitatorId)).phase).toBe('reveal_bid');
    expect(ok(closeImmunityBid(match, T0 + BID_CLOCK_MS)).phase).toBe('reveal_bid');
  });
});

describe('setImmunityBid (US-2.1)', () => {
  it('latest selection replaces the previous one', () => {
    let match = bidding();
    match = ok(setImmunityBid(match, 'p1@x.com', 3, T0));
    match = ok(setImmunityBid(match, 'P1@X.com', 1, T0 + 10));
    expect(findPlayer(match, 'p1@x.com')?.immunityBid).toBe(1);
  });

  it('rejects spending more than the balance, negatives and fractions', () => {
    const match = bidding();
    expect(setImmunityBid(match, 'p1@x.com', 6, T0)).toEqual({ ok: false, error: 'bid_exceeds_tokens' });
    expect(setImmunityBid(match, 'p1@x.com', -1, T0)).toEqual({ ok: false, error: 'invalid_bid' });
    expect(setImmunityBid(match, 'p1@x.com', 1.5, T0)).toEqual({ ok: false, error: 'invalid_bid' });
    expect(ok(setImmunityBid(match, 'p1@x.com', 5, T0)).players[0]?.immunityBid).toBe(5);
  });

  it('rejects unknown players, fired players, and bids outside the open clock', () => {
    const match = bidding();
    expect(setImmunityBid(match, 'ghost@x.com', 1, T0)).toEqual({ ok: false, error: 'unknown_player' });
    expect(setImmunityBid(match, 'p1@x.com', 1, T0 + BID_CLOCK_MS)).toEqual({ ok: false, error: 'clock_expired' });
    expect(setImmunityBid(revealed(), 'p1@x.com', 1, T0)).toEqual({ ok: false, error: 'wrong_phase' });

    const withFired: Match = {
      ...match,
      players: match.players.map((p) => (p.email === 'p1@x.com' ? { ...p, status: 'fired', rank: null } : p)),
    };
    expect(setImmunityBid(withFired, 'p1@x.com', 1, T0)).toEqual({ ok: false, error: 'not_active' });
  });

  it('a reopened phone sees its own selection but no one else’s', () => {
    let match = bidding();
    match = ok(setImmunityBid(match, 'p1@x.com', 2, T0));
    match = ok(setImmunityBid(match, 'p2@x.com', 4, T0));
    const restored: Match = JSON.parse(JSON.stringify(match));
    const view = viewForPlayer(restored, 'p1@x.com');
    expect(view.me?.immunityBid).toBe(2);
    expect(view.players.every((p) => !('immunityBid' in p))).toBe(true);
  });
});

describe('closeImmunityBid (US-2.3, US-2.4)', () => {
  it('spends selections, defaults to 0, and publishes spends and nominees', () => {
    let match = bidding(7);
    match = ok(setImmunityBid(match, 'p1@x.com', 3, T0));
    match = ok(setImmunityBid(match, 'p2@x.com', 2, T0));
    match = ok(setImmunityBid(match, 'p3@x.com', 1, T0));
    const closed = ok(closeImmunityBid(match, T0 + BID_CLOCK_MS));

    expect(findPlayer(closed, 'p1@x.com')?.tokens).toBe(2);
    expect(findPlayer(closed, 'p2@x.com')?.tokens).toBe(3);
    expect(findPlayer(closed, 'p7@x.com')?.tokens).toBe(5);
    expect(closed.players.every((p) => p.immunityBid === 0)).toBe(true);
    expect(closed.bidSpends).toContainEqual({ email: 'p1@x.com', spent: 3 });
    expect(closed.bidSpends).toContainEqual({ email: 'p7@x.com', spent: 0 });
    // 7 players → 3 nominees; four spent 0 (ranks 4–7), lower ranks go first.
    expect(closed.nominees).toEqual(['p7@x.com', 'p6@x.com', 'p5@x.com']);
    expect(closed.clock).toBeNull();
  });

  it('nominates the count chosen for that match', () => {
    let match = createMatch(prompts, () => 0.5, { ...rewards, nomineesPerRound: 11 });
    for (let i = 1; i <= 60; i++) match = ok(joinMatch(match, `J${i}`, `p${i}@x.com`, () => 0.999999));
    match = ok(revealFirstPrompt(match, match.facilitatorId));
    match = ok(startBidClock(match, match.facilitatorId, T0));
    const closed = ok(closeImmunityBid(match, T0 + BID_CLOCK_MS));
    expect(closed.nominees).toHaveLength(11);
  });
});

describe('selectNominees tie-break example (section 4.4)', () => {
  it('spends 0[#1] 0[#40] 1[#18] 2[#5] 2[#7] 5[#13], nominating 4', () => {
    const p = (rank: number, immunityBid: number): PlayerInMatch => ({
      name: `#${rank}`,
      email: `r${rank}@x.com`,
      status: 'active',
      rank,
      tokens: 5,
      freeTokens: 0,
      immunityBid,
      votes: [],
      firedInRound: null,
      rankWhenFired: null,
    });
    const nominees = selectNominees([p(1, 0), p(40, 0), p(18, 1), p(5, 2), p(7, 2), p(13, 5)], 4);
    expect(nominees.sort()).toEqual(['r1@x.com', 'r18@x.com', 'r40@x.com', 'r7@x.com'].sort());
  });
});
