import { rewards, type Rules } from './rewards';

export const MIN_PLAYERS = 7;
export const MAX_PLAYERS = 60;

export function isValidRosterSize(p: number): boolean {
  return Number.isInteger(p) && p >= MIN_PLAYERS && p <= MAX_PLAYERS;
}

/** Rounds needed to leave only the active winners, firing `nominees − survivors` each round. */
export function roundCount(p: number, rules: Rules = rewards): number {
  const perRound = rules.nomineesPerRound - rules.rewardedSurvivors;
  const total = p - rules.activePlayersWhoWin;
  if (perRound <= 0 || total <= 0) return 0;
  return Math.ceil(total / perRound);
}

/** Firings per round. Full rounds fire `nominees − survivors`; the last round fires whoever is left. */
export function firingsPerRound(p: number, rules: Rules = rewards): number[] {
  const perRound = rules.nomineesPerRound - rules.rewardedSurvivors;
  const rounds = roundCount(p, rules);
  const total = p - rules.activePlayersWhoWin;
  if (rounds <= 0 || perRound <= 0) return [];
  return Array.from({ length: rounds }, (_, index) => Math.min(perRound, total - index * perRound));
}

export function nomineeCount(p: number, round: number, rules: Rules = rewards): number {
  const firings = firingsPerRound(p, rules);
  if (firings[round - 1] === undefined) throw new RangeError(`Round ${round} does not exist for ${p} players`);
  const firedBefore = firings.slice(0, round - 1).reduce((sum, count) => sum + count, 0);
  return Math.min(rules.nomineesPerRound, p - firedBefore);
}

/**
 * How many nominees survive this round. A normal round keeps `rewardedSurvivors`.
 * The closing round keeps more (or fires further) so exactly `activePlayersWhoWin` remain.
 */
export function survivorsThisRound(active: number, nominees: number, rules: Rules = rewards): number {
  const room = Math.max(0, active - rules.activePlayersWhoWin);
  const normalFire = Math.max(0, nominees - rules.rewardedSurvivors);
  let fire = Math.min(normalFire, room);
  if (fire === 0 && room > 0 && nominees >= active) fire = Math.min(nominees, room);
  return Math.max(0, nominees - fire);
}

/** True when this round's nominee slots cover everyone still active, so the bid cannot save anyone. */
export function nominatesAllActive(p: number, round: number, rules: Rules = rewards): boolean {
  const firings = firingsPerRound(p, rules);
  const firedBefore = firings.slice(0, round - 1).reduce((sum, count) => sum + count, 0);
  return nomineeCount(p, round, rules) >= p - firedBefore;
}
