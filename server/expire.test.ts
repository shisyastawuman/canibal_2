import { describe, expect, it } from 'vitest';
import { BID_CLOCK_MS, startBidClock } from '../src/game/bid';
import { createMatch, joinMatch, revealFirstPrompt } from '../src/game/match';
import type { Match, Prompt, Result } from '../src/game/types';
import { expire } from './expire';

const prompts: Prompt[] = Array.from({ length: 7 }, (_, index) => ({ id: `p${index}`, text: `Consigna ${index}` }));

function ok(result: Result): Match {
  if (!result.ok) throw new Error(result.error);
  return result.match;
}

describe('expire', () => {
  it('closes a clock that has reached its deadline and leaves a running clock alone', () => {
    let match = createMatch(prompts, () => 0.5);
    for (let i = 0; i < 7; i++) match = ok(joinMatch(match, `J${i}`, `j${i}@x.com`, () => 0.99));
    match = ok(revealFirstPrompt(match, match.facilitatorId));
    match = ok(startBidClock(match, match.facilitatorId, 1_000));
    expect(expire(match, 1_000 + BID_CLOCK_MS - 1)).toBe(match);
    expect(expire(match, 1_000 + BID_CLOCK_MS).phase).toBe('reveal_bid');
  });
});
