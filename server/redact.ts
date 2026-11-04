import { normalizeEmail } from '../src/game';
import type { Match } from '../src/game';

export type Audience =
  | { role: 'facilitator' }
  | { role: 'player'; email: string }
  | { role: 'public' };

/** A copy of the match safe to send to that audience. The stored match is left intact. */
export function redact(match: Match, audience: Audience): Match {
  if (audience.role === 'facilitator') return match;

  const mine = audience.role === 'player' ? normalizeEmail(audience.email) : '';
  const secret = audience.role === 'public' && (match.phase === 'immunity_bid' || match.phase === 'vote');

  return {
    ...match,
    facilitatorId: '',
    prompt: secret && match.phase === 'vote' ? null : match.prompt,
    players: secret
      ? []
      : match.players.map((player) =>
          audience.role === 'player' && player.email === mine ? player : { ...player, immunityBid: 0, votes: [] },
        ),
    nominees: secret ? [] : match.nominees,
    bidSpends: secret ? null : match.bidSpends,
    facilitatorBonus: secret ? null : match.facilitatorBonus,
    results:
      secret || !match.results
        ? null
        : {
            ...match.results,
            ballots: audience.role === 'player' ? match.results.ballots.filter((ballot) => ballot.email === mine) : [],
          },
    winners: secret ? null : match.winners,
  };
}
