import type { Rules } from './rewards';

export type Phase =
  | 'lobby'
  | 'reveal_prompt'
  | 'immunity_bid'
  | 'reveal_bid'
  | 'prep'
  | 'speeches'
  | 'facilitator_bonus'
  | 'vote'
  | 'reveal_vote'
  | 'round_end'
  | 'victory';

export interface Prompt {
  id: string;
  text: string;
  /** Catalog section. Shown while choosing consignas, not during a match. */
  type?: string;
}

export interface PlayerInMatch {
  name: string;
  /** Normalized (trimmed, lowercased). Identifies the player across phones. */
  email: string;
  status: 'active' | 'fired';
  /** Unique place in the match order, 1 is the top. Null once fired. */
  rank: number | null;
  tokens: number;
  /** Gifted for the current vote only. Spent before influence tokens, then discarded. */
  freeTokens: number;
  /** Current selection during `immunity_bid`. Secret until `reveal_bid`. */
  immunityBid: number;
  /** Current allocation during `vote`. Secret until `reveal_vote`. */
  votes: VoteAllocation[];
  /** Set when fired; kept for the endgame ordering in section 4.8. */
  firedInRound: number | null;
  rankWhenFired: number | null;
}

export interface VoteAllocation {
  nominee: string;
  /** Tokens placed on this nominee. Free tokens are spent before influence tokens. */
  tokens: number;
}

export interface BonusAllocation {
  nominee: string;
  tokens: number;
}

export interface NomineeTotal {
  nominee: string;
  /** Influence and free tokens voted, counted the same. */
  tokens: number;
  bonus: number;
  total: number;
}

export interface TokenAward {
  email: string;
  amount: number;
  reason: 'survivor_reward' | 'vote_refund' | 'top_voter';
  /** The survivor the award relates to. */
  survivor: string;
}

export interface Ballot {
  email: string;
  votes: VoteAllocation[];
  /** Free tokens this player was given and did not put on a nominee. */
  unusedFreeTokens: number;
  /** Influence tokens that will be deducted when rewards are assigned. */
  influenceSpent: number;
}

export interface VoteResults {
  /** Ordered from first to last place. */
  totals: NomineeTotal[];
  survivors: string[];
  fired: string[];
  awards: TokenAward[];
  /** Locked when the vote closes. A phone is only shown its own ballot. */
  ballots: Ballot[];
}

export interface Winner {
  email: string;
  kind: 'active' | 'fired';
}

export interface Clock {
  startedAt: number;
  /** Epoch ms. Only a facilitator may close the phase before this. */
  deadline: number;
}

export interface BidSpend {
  email: string;
  spent: number;
}

export interface Match {
  code: string;
  /** Secret id that lets the facilitator rejoin after a disconnection. */
  facilitatorId: string;
  /** Reward and schedule numbers chosen when this match was created. */
  rules: Rules;
  phase: Phase;
  /** 0 while in `lobby`. */
  round: number;
  prompt: Prompt | null;
  promptOrder: Prompt[];
  players: PlayerInMatch[];
  /** `P`: players in the match when the first prompt is revealed. */
  rosterSize: number | null;
  /** Emails of this round's nominees. */
  nominees: string[];
  clock: Clock | null;
  /** What every active player spent, published on `reveal_bid`. */
  bidSpends: BidSpend[] | null;
  /** Total tokens each voter placed, published on `reveal_vote` (no targets). */
  voteSpends: BidSpend[] | null;
  /** Null when absent or skipped. Public as soon as it is assigned. */
  facilitatorBonus: BonusAllocation[] | null;
  /** Published on `reveal_vote` (outcomes computed; applied on `assignRewards`). */
  results: VoteResults | null;
  /** Whose turn it is during `speeches`: index into speakingOrder. */
  speakerIndex: number | null;
  /** Set on `victory`: the two remaining active players, then the fired winners. */
  winners: Winner[] | null;
}

export type GameError =
  | 'not_facilitator'
  | 'wrong_phase'
  | 'invalid_registration'
  | 'roster_locked'
  | 'roster_size'
  | 'not_enough_prompts'
  | 'invalid_rules'
  | 'unknown_player'
  | 'not_active'
  | 'invalid_bid'
  | 'bid_exceeds_tokens'
  | 'clock_expired'
  | 'clock_still_running'
  | 'invalid_bonus'
  | 'nominee_cannot_vote'
  | 'invalid_vote'
  | 'vote_exceeds_tokens'
  | 'last_round';

export type Result<T = Match> = { ok: true; match: T } | { ok: false; error: GameError };

/** Returns a float in [0, 1). Injected so the module stays deterministic in tests. */
export type Rng = () => number;
