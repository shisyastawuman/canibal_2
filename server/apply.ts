import {
  assignFacilitatorBonus,
  closeImmunityBid,
  closePrep,
  closeSpeech,
  closeVote,
  endRound,
  extendBidClock,
  extendPrepClock,
  extendSpeechClock,
  extendVoteClock,
  joinMatch,
  revealFirstPrompt,
  setImmunityBid,
  setVote,
  startBidClock,
  startNextRound,
  startPrepClock,
  startSpeechClock,
  startVoteClock,
} from '../src/game';
import type { BonusAllocation, Match, Result, Rng, VoteAllocation } from '../src/game';

export type Command =
  | { type: 'join'; name: string; email: string }
  | { type: 'setBid'; email: string; amount: number }
  | { type: 'setVote'; email: string; allocation: VoteAllocation[] }
  | { type: 'assignBonus'; facilitatorId: string; allocation: BonusAllocation[] }
  | { type: 'tick' }
  | {
      type:
        | 'reveal'
        | 'startBid'
        | 'extendBid'
        | 'closeBid'
        | 'startPrep'
        | 'extendPrep'
        | 'closePrep'
        | 'startSpeech'
        | 'extendSpeech'
        | 'closeSpeech'
        | 'startVote'
        | 'extendVote'
        | 'closeVote'
        | 'advance';
      facilitatorId: string;
    };

/** Applies one command. Callers close an expired clock before this. */
export function applyCommand(match: Match, command: Command, now: number, rng: Rng): Result {
  switch (command.type) {
    case 'tick':
      return { ok: true, match };
    case 'join':
      return joinMatch(match, command.name, command.email, rng);
    case 'setBid':
      return setImmunityBid(match, command.email, command.amount, now);
    case 'setVote':
      return setVote(match, command.email, command.allocation, now);
    case 'assignBonus':
      return assignFacilitatorBonus(match, command.facilitatorId, command.allocation);
    case 'reveal':
      return revealFirstPrompt(match, command.facilitatorId);
    case 'startBid':
      return startBidClock(match, command.facilitatorId, now);
    case 'extendBid':
      return extendBidClock(match, command.facilitatorId, now);
    case 'closeBid':
      return closeImmunityBid(match, now, command.facilitatorId);
    case 'startPrep':
      return startPrepClock(match, command.facilitatorId, now);
    case 'extendPrep':
      return extendPrepClock(match, command.facilitatorId, now);
    case 'closePrep':
      return closePrep(match, now, command.facilitatorId);
    case 'startSpeech':
      return startSpeechClock(match, command.facilitatorId, now);
    case 'extendSpeech':
      return extendSpeechClock(match, command.facilitatorId, now);
    case 'closeSpeech':
      return closeSpeech(match, now, command.facilitatorId);
    case 'startVote':
      return startVoteClock(match, command.facilitatorId, now);
    case 'extendVote':
      return extendVoteClock(match, command.facilitatorId, now);
    case 'closeVote':
      return closeVote(match, now, command.facilitatorId);
    case 'advance':
      return advance(match, command.facilitatorId);
  }
}

function advance(match: Match, facilitatorId: string): Result {
  const ended = match.phase === 'reveal_vote' ? endRound(match, facilitatorId) : { ok: true as const, match };
  if (!ended.ok) return ended;
  return startNextRound(ended.match, facilitatorId);
}
