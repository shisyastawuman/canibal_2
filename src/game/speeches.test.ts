import { describe, expect, it } from 'vitest';
import { BID_CLOCK_MS, closeImmunityBid, setImmunityBid, startBidClock } from './bid';
import { createMatch, joinMatch, revealFirstPrompt } from './match';
import {
  closePrep,
  closeSpeech,
  extendSpeechClock,
  PREP_CLOCK_MS,
  rankingOrder,
  speakingOrder,
  SPEECH_CLOCK_MS,
  startPrepClock,
  startSpeechClock,
} from './speeches';
import type { Match, Prompt, Result } from './types';

const T0 = 1_000_000;
const prompts: Prompt[] = Array.from({ length: 7 }, (_, i) => ({ id: `p${i + 1}`, text: `Consigna ${i + 1}` }));

function ok(result: Result): Match {
  if (!result.ok) throw new Error(result.error);
  return result.match;
}

function revealed(): Match {
  let match = createMatch(prompts, () => 0.5);
  for (let i = 1; i <= 7; i++) match = ok(joinMatch(match, `J${i}`, `p${i}@x.com`, () => 0.999999));
  return ok(revealFirstPrompt(match, match.facilitatorId));
}

describe('spoken prompt (US-3.1 – US-3.3)', () => {
  it('prepares for 30s, then speaks lowest bid first (ties: worst rank), one strict minute each', () => {
    let match = revealed();
    const f = match.facilitatorId;
    match = ok(startBidClock(match, f, T0));
    match = ok(setImmunityBid(match, 'p7@x.com', 0, T0));
    match = ok(setImmunityBid(match, 'p1@x.com', 0, T0));
    match = ok(setImmunityBid(match, 'p6@x.com', 1, T0));
    for (const email of ['p2@x.com', 'p3@x.com', 'p4@x.com', 'p5@x.com']) {
      match = ok(setImmunityBid(match, email, 2, T0));
    }
    match = ok(closeImmunityBid(match, T0 + BID_CLOCK_MS));
    expect(match.nominees).toEqual(['p7@x.com', 'p1@x.com', 'p6@x.com']);

    expect(startPrepClock({ ...match, nominees: [] }, f, T0)).toEqual({ ok: false, error: 'wrong_phase' });
    match = ok(startPrepClock(match, f, T0));
    expect(match.phase).toBe('prep');
    expect(match.clock?.deadline).toBe(T0 + PREP_CLOCK_MS);
    expect(closePrep(match, T0 + 1)).toEqual({ ok: false, error: 'clock_still_running' });

    match = ok(closePrep(match, T0 + PREP_CLOCK_MS));
    expect(match.phase).toBe('speeches');
    // Lowest bid first; among 0-bids, worse rank (p7) before better rank (p1).
    expect(speakingOrder(match)).toEqual(['p7@x.com', 'p1@x.com', 'p6@x.com']);
    expect(rankingOrder(match)).toEqual(['p1@x.com', 'p6@x.com', 'p7@x.com']);
    expect(match.speakerIndex).toBe(0);

    match = ok(startSpeechClock(match, f, T0));
    expect(match.clock?.deadline).toBe(T0 + SPEECH_CLOCK_MS);
    expect(ok(extendSpeechClock(match, f, T0)).clock?.deadline).toBe(T0 + SPEECH_CLOCK_MS + 30_000);
    match = ok(closeSpeech(match, T0 + 1, f));
    expect(match.speakerIndex).toBe(1);
    expect(match.phase).toBe('speeches');

    match = ok(startSpeechClock(match, f, T0));
    match = ok(closeSpeech(match, T0 + SPEECH_CLOCK_MS));
    match = ok(startSpeechClock(match, f, T0));
    match = ok(closeSpeech(match, T0 + SPEECH_CLOCK_MS));
    expect(match.phase).toBe('facilitator_bonus');
    expect(match.speakerIndex).toBeNull();
    expect(match.facilitatorBonus).toBeNull();
  });

  it('lists fired nominees by the rank they had', () => {
    expect(
      rankingOrder({
        nominees: ['gone@x.com', 'lead@x.com'],
        players: [
          { email: 'gone@x.com', rank: null, rankWhenFired: 4 },
          { email: 'lead@x.com', rank: 1, rankWhenFired: null },
        ],
      }),
    ).toEqual(['lead@x.com', 'gone@x.com']);
  });

  it('refuses a speech clock before prep has produced nominees in the speech phase', () => {
    const match = revealed();
    expect(startSpeechClock(match, match.facilitatorId, T0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(closeSpeech(match, T0, match.facilitatorId)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});
