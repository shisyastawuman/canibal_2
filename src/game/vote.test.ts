import { describe, expect, it } from 'vitest';
import { BID_CLOCK_MS, closeImmunityBid, setImmunityBid, startBidClock } from './bid';
import { createMatch, findPlayer, joinMatch, revealFirstPrompt } from './match';
import { endRound, startNextRound } from './round';
import { closePrep, closeSpeech, PREP_CLOCK_MS, SPEECH_CLOCK_MS, startPrepClock, startSpeechClock } from './speeches';
import type { Match, Prompt, Result } from './types';
import { viewForPlayer } from './view';
import {
  assignFacilitatorBonus,
  closeVote,
  extendVoteClock,
  setVote,
  startVoteClock,
  tallyVotes,
  VOTE_CLOCK_MS,
} from './vote';

const T0 = 1_000_000;
const AFTER_BID = T0 + BID_CLOCK_MS;
const T1 = AFTER_BID + 1000;
const AFTER_VOTE = T1 + VOTE_CLOCK_MS;
const prompts: Prompt[] = Array.from({ length: 7 }, (_, i) => ({ id: `p${i + 1}`, text: `Consigna ${i + 1}` }));

function ok(result: Result): Match {
  if (!result.ok) throw new Error(result.error);
  return result.match;
}

const rank = (m: Match, email: string) => findPlayer(m, email)?.rank;
const tokens = (m: Match, email: string) => findPlayer(m, email)?.tokens;

/** 7 players, p{i} holds rank i, first prompt revealed. */
function started(): Match {
  let match = createMatch(prompts, () => 0.5);
  for (let i = 1; i <= 7; i++) match = ok(joinMatch(match, `J${i}`, `p${i}@x.com`, () => 0.999999));
  return ok(revealFirstPrompt(match, match.facilitatorId));
}

/** p1–p4 bid 1, p5–p7 bid 0, so p5, p6, p7 are nominated. Ends in `facilitator_bonus`. */
function finishSpeeches(match: Match): Match {
  const f = match.facilitatorId;
  let next = ok(startPrepClock(match, f, AFTER_BID));
  next = ok(closePrep(next, AFTER_BID + PREP_CLOCK_MS));
  while (next.phase === 'speeches') {
    next = ok(startSpeechClock(next, f, AFTER_BID));
    next = ok(closeSpeech(next, AFTER_BID + SPEECH_CLOCK_MS));
  }
  return next;
}

function atBonus(): Match {
  let match = started();
  const f = match.facilitatorId;
  match = ok(startBidClock(match, f, T0));
  for (const e of ['p1@x.com', 'p2@x.com', 'p3@x.com', 'p4@x.com']) match = ok(setImmunityBid(match, e, 1, T0));
  match = ok(closeImmunityBid(match, AFTER_BID));
  return finishSpeeches(match);
}

function voting(): Match {
  const match = atBonus();
  return ok(startVoteClock(match, match.facilitatorId, T1));
}

describe('done when: a 7-player round from start to firing', () => {
  it('starts, nominates the lowest bids, fires the fewest votes, and the fired keep voting', () => {
    let match = started();
    const f = match.facilitatorId;
    expect(match.phase).toBe('reveal_prompt');

    match = atBonus();
    expect(match.nominees).toEqual(['p7@x.com', 'p6@x.com', 'p5@x.com']);

    match = ok(assignFacilitatorBonus(match, f, [{ nominee: 'p7@x.com', tokens: 2 }]));
    match = ok(startVoteClock(match, f, T1));
    match = ok(setVote(match, 'p1@x.com', [{ nominee: 'p5@x.com', tokens: 2, specialTokens: 1 }], T1));
    match = ok(setVote(match, 'p2@x.com', [{ nominee: 'p6@x.com', tokens: 1, specialTokens: 1 }], T1));
    match = ok(setVote(match, 'p3@x.com', [{ nominee: 'p5@x.com', tokens: 0, specialTokens: 1 }], T1));
    match = ok(closeVote(match, AFTER_VOTE));

    // p5 = 4, p6 = 2, p7 = 2 (bonus). p6 and p7 tie: the better rank (#6) survives.
    expect(match.phase).toBe('reveal_vote');
    expect(match.results?.totals.map((t) => [t.nominee, t.total])).toEqual([
      ['p5@x.com', 4],
      ['p6@x.com', 2],
      ['p7@x.com', 2],
    ]);
    expect(match.results?.survivors).toEqual(['p5@x.com', 'p6@x.com']);
    expect(match.results?.fired).toEqual(['p7@x.com']);

    const p7 = findPlayer(match, 'p7@x.com')!;
    expect(p7).toMatchObject({ status: 'fired', rank: null, tokens: 5, firedInRound: 1, rankWhenFired: 7 });

    // Next round: p7 cannot bid or be nominated, but votes with 3 special tokens.
    match = ok(endRound(match, f));
    match = ok(startNextRound(match, f));
    expect(match.round).toBe(2);
    match = ok(startBidClock(match, f, T0));
    expect(setImmunityBid(match, 'p7@x.com', 0, T0)).toEqual({ ok: false, error: 'not_active' });
    match = ok(closeImmunityBid(match, AFTER_BID));
    expect(match.nominees).not.toContain('p7@x.com');
    expect(match.nominees).toHaveLength(3);

    match = finishSpeeches(match);
    match = ok(startVoteClock(match, f, T1));
    expect(findPlayer(match, 'p7@x.com')?.specialTokens).toBe(3);
    const target = match.nominees[0]!;
    match = ok(setVote(match, 'p7@x.com', [{ nominee: target, tokens: 0, specialTokens: 3 }], T1));
    match = ok(closeVote(match, AFTER_VOTE));
    expect(match.results?.totals.find((t) => t.nominee === target)?.specialTokens).toBe(3);
  });
});

describe('reveal_vote rewards (section 4.6)', () => {
  function revealed(): Match {
    let match = atBonus();
    const f = match.facilitatorId;
    match = ok(assignFacilitatorBonus(match, f, [{ nominee: 'p7@x.com', tokens: 2 }]));
    match = ok(startVoteClock(match, f, T1));
    match = ok(setVote(match, 'p1@x.com', [{ nominee: 'p5@x.com', tokens: 2, specialTokens: 1 }], T1));
    match = ok(setVote(match, 'p2@x.com', [{ nominee: 'p6@x.com', tokens: 1, specialTokens: 1 }], T1));
    match = ok(setVote(match, 'p3@x.com', [{ nominee: 'p5@x.com', tokens: 0, specialTokens: 1 }], T1));
    return ok(closeVote(match, AFTER_VOTE));
  }

  it('compacts after firing, then promotes the lower-ranked survivor first', () => {
    const match = revealed();
    // After compaction p6 is #6 and moves to #4; then p5 (pushed to #6) moves to #4.
    expect(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((p) => rank(match, `${p}@x.com`))).toEqual([1, 2, 3, 6, 4, 5]);
  });

  it('survivors gain 3; voters get back what they invested + 2; each top voter gains 1', () => {
    const match = revealed();
    expect(tokens(match, 'p5@x.com')).toBe(8);
    expect(tokens(match, 'p6@x.com')).toBe(8);
    expect(tokens(match, 'p1@x.com')).toBe(4 - 2 + (3 + 2) + 1);
    expect(tokens(match, 'p2@x.com')).toBe(4 - 1 + (2 + 2) + 1);
    expect(tokens(match, 'p3@x.com')).toBe(4 + (1 + 2));
    expect(tokens(match, 'p4@x.com')).toBe(4);
  });

  it('unused special tokens are lost at the close', () => {
    const match = revealed();
    expect(match.players.every((p) => p.specialTokens === 0)).toBe(true);
    expect(match.players.every((p) => p.votes.length === 0)).toBe(true);
  });

  it('every tied top voter gains 1', () => {
    let match = voting();
    match = ok(setVote(match, 'p1@x.com', [{ nominee: 'p5@x.com', tokens: 1, specialTokens: 0 }], T1));
    match = ok(setVote(match, 'p2@x.com', [{ nominee: 'p5@x.com', tokens: 1, specialTokens: 0 }], T1));
    match = ok(closeVote(match, AFTER_VOTE));
    const topVoters = match.results?.awards.filter((a) => a.reason === 'top_voter' && a.survivor === 'p5@x.com');
    expect(topVoters?.map((a) => a.email).sort()).toEqual(['p1@x.com', 'p2@x.com']);
  });

  it('with no votes, the two best-ranked nominees survive', () => {
    const match = ok(closeVote(voting(), AFTER_VOTE));
    expect(match.results?.survivors).toEqual(['p5@x.com', 'p6@x.com']);
    expect(match.results?.fired).toEqual(['p7@x.com']);
  });
});

describe('facilitator bonus (US-4.1)', () => {
  it('splits up to 5 tokens among nominees, publicly, and joins the totals', () => {
    let match = atBonus();
    const f = match.facilitatorId;
    match = ok(
      assignFacilitatorBonus(match, f, [
        { nominee: 'p7@x.com', tokens: 3 },
        { nominee: 'p6@x.com', tokens: 2 },
      ]),
    );
    expect(viewForPlayer(match, 'p1@x.com').facilitatorBonus).toHaveLength(2);
    match = ok(startVoteClock(match, f, T1));
    expect(tallyVotes(match).map((t) => [t.nominee, t.total])).toEqual([
      ['p7@x.com', 3],
      ['p6@x.com', 2],
      ['p5@x.com', 0],
    ]);
  });

  it('rejects more than 5, non-nominees, duplicates, negatives and non-facilitators', () => {
    const match = atBonus();
    const f = match.facilitatorId;
    const bad = { ok: false, error: 'invalid_bonus' };
    expect(assignFacilitatorBonus(match, f, [{ nominee: 'p7@x.com', tokens: 6 }])).toEqual(bad);
    expect(assignFacilitatorBonus(match, f, [{ nominee: 'p1@x.com', tokens: 1 }])).toEqual(bad);
    expect(assignFacilitatorBonus(match, f, [{ nominee: 'p7@x.com', tokens: -1 }])).toEqual(bad);
    expect(
      assignFacilitatorBonus(match, f, [
        { nominee: 'p7@x.com', tokens: 1 },
        { nominee: 'p7@x.com', tokens: 1 },
      ]),
    ).toEqual(bad);
    expect(assignFacilitatorBonus(match, 'nope', [])).toEqual({ ok: false, error: 'not_facilitator' });
  });

  it('can be skipped by starting the vote directly', () => {
    const match = voting();
    expect(match.facilitatorBonus).toBeNull();
    expect(match.phase).toBe('vote');
  });
});

describe('vote (US-4.2 – US-4.5)', () => {
  it('hands 1 special token to active non-nominees and none to nominees', () => {
    const match = voting();
    expect(findPlayer(match, 'p1@x.com')?.specialTokens).toBe(1);
    expect(findPlayer(match, 'p5@x.com')?.specialTokens).toBe(0);
  });

  it('nominees cannot vote', () => {
    const match = voting();
    expect(setVote(match, 'p5@x.com', [], T1)).toEqual({ ok: false, error: 'nominee_cannot_vote' });
  });

  it('allows several tokens on one nominee and the latest allocation replaces the previous', () => {
    let match = voting();
    match = ok(setVote(match, 'p1@x.com', [{ nominee: 'p5@x.com', tokens: 4, specialTokens: 1 }], T1));
    match = ok(setVote(match, 'p1@x.com', [{ nominee: 'p6@x.com', tokens: 1, specialTokens: 0 }], T1 + 5));
    expect(findPlayer(match, 'p1@x.com')?.votes).toEqual([{ nominee: 'p6@x.com', tokens: 1, specialTokens: 0 }]);
  });

  it('rejects spending beyond either balance, non-nominees and bad amounts', () => {
    const match = voting();
    const vote = (nominee: string, t: number, s: number) =>
      setVote(match, 'p1@x.com', [{ nominee, tokens: t, specialTokens: s }], T1);
    expect(vote('p5@x.com', 5, 0)).toEqual({ ok: false, error: 'vote_exceeds_tokens' });
    expect(vote('p5@x.com', 0, 2)).toEqual({ ok: false, error: 'vote_exceeds_special_tokens' });
    expect(vote('p2@x.com', 1, 0)).toEqual({ ok: false, error: 'invalid_vote' });
    expect(vote('p5@x.com', 0.5, 0)).toEqual({ ok: false, error: 'invalid_vote' });
    expect(setVote(match, 'ghost@x.com', [], T1)).toEqual({ ok: false, error: 'unknown_player' });
  });

  it('closes on its own at the deadline; only the facilitator closes early or adds 30 s', () => {
    const match = voting();
    const f = match.facilitatorId;
    expect(setVote(match, 'p1@x.com', [], AFTER_VOTE)).toEqual({ ok: false, error: 'clock_expired' });
    expect(closeVote(match, T1 + 1)).toEqual({ ok: false, error: 'clock_still_running' });
    expect(ok(closeVote(match, T1 + 1, f)).phase).toBe('reveal_vote');
    expect(ok(extendVoteClock(match, f, T1 + 1)).clock?.deadline).toBe(AFTER_VOTE + 30_000);
  });

  it('a phone sees its own allocation but not anyone else’s', () => {
    let match = voting();
    match = ok(setVote(match, 'p1@x.com', [{ nominee: 'p5@x.com', tokens: 1, specialTokens: 0 }], T1));
    match = ok(setVote(match, 'p2@x.com', [{ nominee: 'p6@x.com', tokens: 1, specialTokens: 0 }], T1));
    const view = viewForPlayer(match, 'p1@x.com');
    expect(view.me?.votes).toHaveLength(1);
    expect(view.players.every((p) => !('votes' in p))).toBe(true);
  });

  it('cannot reach prep or vote out of order', () => {
    const match = started();
    expect(startPrepClock(match, match.facilitatorId, T0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(startSpeechClock(match, match.facilitatorId, T0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(startVoteClock(match, match.facilitatorId, T1)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('rounds', () => {
  it('a 7-player match declares victory instead of opening a 6th round', () => {
    let match: Match = { ...ok(closeVote(voting(), AFTER_VOTE)), round: 5 };
    match = ok(endRound(match, match.facilitatorId));
    const done = ok(startNextRound(match, match.facilitatorId));
    expect(done.phase).toBe('victory');
    expect(done.winners?.some((w) => w.kind === 'fired')).toBe(true);
  });
});
