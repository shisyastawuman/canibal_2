export const MIN_PLAYERS = 7;
export const MAX_PLAYERS = 60;

export function isValidRosterSize(p: number): boolean {
  return Number.isInteger(p) && p >= MIN_PLAYERS && p <= MAX_PLAYERS;
}

export function roundCount(p: number): number {
  return Math.min(7, p - 2);
}

/** Firings per round: `P − 2` spread evenly, earlier rounds take the extra. */
export function firingsPerRound(p: number): number[] {
  const rounds = roundCount(p);
  const total = p - 2;
  const base = Math.floor(total / rounds);
  const extra = total % rounds;
  return Array.from({ length: rounds }, (_, i) => base + (i < extra ? 1 : 0));
}

export function nomineeCount(p: number, round: number): number {
  const firings = firingsPerRound(p)[round - 1];
  if (firings === undefined) throw new RangeError(`Round ${round} does not exist for ${p} players`);
  return firings + 2;
}
