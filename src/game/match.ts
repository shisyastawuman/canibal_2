import { copyRules, rewards, rulesOf } from './rewards';
import type { Rules } from './rewards';
import { isValidRosterSize, roundCount } from './schedule';
import type { Match, PlayerInMatch, Prompt, Result, Rng } from './types';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const FACILITATOR_ID_LENGTH = 20;

function randomString(rng: Rng, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return out;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function findPlayer(match: Match, email: string): PlayerInMatch | undefined {
  const key = normalizeEmail(email);
  return match.players.find((p) => p.email === key);
}

export function isFacilitator(match: Match, facilitatorId: string): boolean {
  return match.facilitatorId === facilitatorId;
}

export function createMatch(promptOrder: Prompt[], rng: Rng, rules: Rules = rewards): Match {
  return {
    code: randomString(rng, CODE_LENGTH),
    facilitatorId: randomString(rng, FACILITATOR_ID_LENGTH),
    rules: copyRules(rules),
    phase: 'lobby',
    round: 0,
    prompt: null,
    promptOrder: [...promptOrder],
    players: [],
    rosterSize: null,
    nominees: [],
    clock: null,
    bidSpends: null,
    facilitatorBonus: null,
    results: null,
    speakerIndex: null,
    winners: null,
  };
}

/**
 * Registers a new player, or returns the match unchanged if that email is
 * already in (a reopened app or a second phone acting as the same player).
 * A new player is inserted at a uniformly random rank; players at or below
 * that rank move down one place, so ranks stay unique.
 */
export function joinMatch(match: Match, name: string, email: string, rng: Rng): Result {
  const cleanName = name.trim();
  const key = normalizeEmail(email);
  if (!cleanName || !key) return { ok: false, error: 'invalid_registration' };

  if (findPlayer(match, key)) return { ok: true, match };
  if (match.phase !== 'lobby') return { ok: false, error: 'roster_locked' };

  const rank = Math.floor(rng() * (match.players.length + 1)) + 1;
  const shifted = match.players.map((p) =>
    p.rank !== null && p.rank >= rank ? { ...p, rank: p.rank + 1 } : p,
  );
  const player: PlayerInMatch = {
    name: cleanName,
    email: key,
    status: 'active',
    rank,
    tokens: rulesOf(match).startingInfluenceTokens,
    freeTokens: 0,
    immunityBid: 0,
    votes: [],
    firedInRound: null,
    rankWhenFired: null,
  };
  return { ok: true, match: { ...match, players: [...shifted, player] } };
}

/** Reveals the first prompt and locks the roster. */
export function revealFirstPrompt(match: Match, facilitatorId: string): Result {
  if (!isFacilitator(match, facilitatorId)) return { ok: false, error: 'not_facilitator' };
  if (match.phase !== 'lobby') return { ok: false, error: 'wrong_phase' };

  const p = match.players.length;
  if (!isValidRosterSize(p)) return { ok: false, error: 'roster_size' };
  if (match.promptOrder.length < roundCount(p, rulesOf(match))) return { ok: false, error: 'not_enough_prompts' };

  return {
    ok: true,
    match: {
      ...match,
      phase: 'reveal_prompt',
      round: 1,
      prompt: match.promptOrder[0] ?? null,
      rosterSize: p,
    },
  };
}
