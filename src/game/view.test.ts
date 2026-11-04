import { describe, expect, it } from 'vitest';
import { BID_CLOCK_MS, closeImmunityBid, startBidClock } from './bid';
import { createMatch, joinMatch, revealFirstPrompt } from './match';
import type { Match, Prompt, Result } from './types';
import { viewForPlayer, viewForPublic } from './view';
import { closeVote, setVote, startVoteClock, VOTE_CLOCK_MS } from './vote';

const prompts: Prompt[] = Array.from({ length: 7 }, (_, i) => ({ id: `p${i + 1}`, text: `Consigna ${i + 1}` }));

function ok(result: Result): Match {
  if (!result.ok) throw new Error(result.error);
  return result.match;
}

function lobby(): Match {
  let match = createMatch(prompts, () => 0.5);
  for (let i = 1; i <= 7; i++) match = ok(joinMatch(match, `J${i}`, `p${i}@x.com`, () => 0.999999));
  return match;
}

describe('public view (US-1.4, US-2.5, US-4.7)', () => {
  it('shows who joined before the first prompt', () => {
    const view = viewForPublic(lobby());
    expect(view.players).toHaveLength(7);
    expect(view.prompt).toBeNull();
    expect(JSON.stringify(view)).not.toContain(lobby().facilitatorId);
  });

  it('during the bid and the vote, publishes only the clock and the phase instructions', () => {
    const match = ok(revealFirstPrompt(lobby(), lobby().facilitatorId));
    const bidding = ok(startBidClock(match, match.facilitatorId, 1_000));
    const bidView = viewForPublic(bidding);
    expect(bidView.clock?.deadline).toBe(1_000 + BID_CLOCK_MS);
    expect(bidView.prompt?.text).toBe('Consigna 1');
    expect(bidView.instructions).toMatch(/Puja/);
    expect(bidView.players).toBeNull();
    expect(bidView.bidSpends).toBeNull();
    expect(JSON.stringify(bidView)).not.toContain('immunityBid');

    const revealed = ok(closeImmunityBid(bidding, 1_000 + BID_CLOCK_MS));
    const after = viewForPublic(revealed);
    expect(after.players).toHaveLength(7);
    expect(after.bidSpends).toHaveLength(7);
    expect(after.nominees).toHaveLength(3);

    const voting = ok(startVoteClock({ ...revealed, phase: 'facilitator_bonus' }, revealed.facilitatorId, 5_000));
    const voteView = viewForPublic(voting);
    expect(voteView.players).toBeNull();
    expect(voteView.prompt).toBeNull();
    expect(voteView.instructions).toMatch(/Votación/);
    expect(voteView.clock?.deadline).toBe(5_000 + VOTE_CLOCK_MS);
    expect(JSON.stringify(voteView)).not.toContain('p1@x.com');

    const results = viewForPublic(ok(closeVote(voting, 5_000 + VOTE_CLOCK_MS)));
    expect(results.results?.totals).toHaveLength(3);
    expect(results.results?.survivors).toHaveLength(2);
    expect(JSON.stringify(results)).not.toContain('ballots');
  });

  it('a player sees their own ballot after the reveal and nobody else’s', () => {
    let match = ok(revealFirstPrompt(lobby(), lobby().facilitatorId));
    match = ok(startBidClock(match, match.facilitatorId, 1_000));
    match = ok(closeImmunityBid(match, 1_000 + BID_CLOCK_MS));
    match = ok(startVoteClock({ ...match, phase: 'facilitator_bonus' }, match.facilitatorId, 5_000));
    const nominee = match.nominees[0];
    if (!nominee) throw new Error('no nominee');
    const voter = match.players.find((p) => !match.nominees.includes(p.email));
    if (!voter) throw new Error('no voter');
    match = ok(setVote(match, voter.email, [{ nominee, tokens: 2 }], 5_000));
    match = ok(closeVote(match, 5_000 + VOTE_CLOCK_MS));

    const mine = viewForPlayer(match, voter.email);
    expect(mine.results?.ballots).toEqual([{ email: voter.email, votes: [{ nominee, tokens: 2 }], unusedFreeTokens: 0 }]);
    const other = match.players.find((p) => p.email !== voter.email);
    const otherView = viewForPlayer(match, other?.email ?? '');
    expect(otherView.results?.ballots.every((b) => b.email === other?.email)).toBe(true);
    expect(otherView.results?.ballots.some((b) => b.votes.some((v) => v.tokens > 0))).toBe(false);
    expect(mine.players.every((p) => !('votes' in p))).toBe(true);
  });
});
