import { describe, expect, it } from 'vitest';
import { BID_CLOCK_MS, closeImmunityBid, startBidClock } from './bid';
import { createMatch, findPlayer, joinMatch, revealFirstPrompt } from './match';
import { endRound, startNextRound } from './round';
import { roundCount } from './schedule';
import { closePrep, closeSpeech, PREP_CLOCK_MS, SPEECH_CLOCK_MS, startPrepClock, startSpeechClock } from './speeches';
import type { Match, Prompt, Result } from './types';
import { closeVote, startVoteClock, VOTE_CLOCK_MS } from './vote';

const prompts: Prompt[] = Array.from({ length: 7 }, (_, i) => ({ id: `p${i + 1}`, text: `Consigna ${i + 1}` }));

function ok(result: Result): Match {
  if (!result.ok) throw new Error(result.error);
  return result.match;
}

/** Plays one round with every bid and vote left at 0, then advances. */
function playRound(match: Match, now: number): Match {
  const f = match.facilitatorId;
  let next = ok(startBidClock(match, f, now));
  next = ok(closeImmunityBid(next, now + BID_CLOCK_MS));
  next = ok(startPrepClock(next, f, now));
  next = ok(closePrep(next, now + PREP_CLOCK_MS));
  while (next.phase === 'speeches') {
    next = ok(startSpeechClock(next, f, now));
    next = ok(closeSpeech(next, now + SPEECH_CLOCK_MS));
  }
  next = ok(startVoteClock(next, f, now));
  next = ok(closeVote(next, now + VOTE_CLOCK_MS));
  next = ok(endRound(next, f));
  return ok(startNextRound(next, f));
}

describe('a full match (US-6.1)', () => {
  it('plays every round of a 7-player match and ends with 3 winners', () => {
    let match = createMatch(prompts, () => 0.5);
    for (let i = 1; i <= 7; i++) match = ok(joinMatch(match, `J${i}`, `p${i}@x.com`, () => 0.999999));
    match = ok(revealFirstPrompt(match, match.facilitatorId));
    expect(roundCount(match.rosterSize ?? 0)).toBe(5);

    match = playRound(match, 1_000);
    const firstFired = match.players.find((p) => p.status === 'fired');
    expect(firstFired?.rank).toBeNull();
    expect(firstFired?.firedInRound).toBe(1);

    for (let round = 2; round <= 5; round++) match = playRound(match, round * 1_000_000);

    expect(match.phase).toBe('victory');
    expect(match.players.filter((p) => p.status === 'active')).toHaveLength(2);
    expect(match.winners).toHaveLength(3);
    const activeWinners = match.winners?.filter((w) => w.kind === 'active').map((w) => w.email);
    const stillActive = match.players.filter((p) => p.status === 'active').sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    expect(activeWinners).toEqual(stillActive.map((p) => p.email));

    const firedWinner = match.winners?.find((w) => w.kind === 'fired');
    const firedPlayers = match.players.filter((p) => p.status === 'fired');
    const winnerTokens = findPlayer(match, firedWinner?.email ?? '')?.tokens ?? -1;
    expect(firedPlayers.every((p) => p.tokens <= winnerTokens)).toBe(true);
    expect(firedPlayers.every((p) => p.freeTokens === 0)).toBe(true);
  });
});
