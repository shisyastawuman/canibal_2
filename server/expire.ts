import { closeImmunityBid, closePrep, closeSpeech, closeVote } from '../src/game';
import type { Match } from '../src/game';

/** Closes a clock whose deadline has passed. The same object comes back when nothing is due. */
export function expire(match: Match, now: number): Match {
  let current = match;
  for (let i = 0; i < 12; i++) {
    if (!current.clock || now < current.clock.deadline) return current;
    const closed =
      current.phase === 'immunity_bid'
        ? closeImmunityBid(current, now)
        : current.phase === 'prep'
          ? closePrep(current, now)
          : current.phase === 'speeches'
            ? closeSpeech(current, now)
            : current.phase === 'vote'
              ? closeVote(current, now)
              : null;
    if (!closed || !closed.ok || closed.match === current) return current;
    current = closed.match;
  }
  return current;
}
