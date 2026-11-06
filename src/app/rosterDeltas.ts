import type { BidSpend, TokenAward } from '../game';
import type { RosterPlayer } from './ActivePlayersList';

export function spendDeltas(spends: readonly BidSpend[] | null | undefined, sign: '-' | '+'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of spends ?? []) {
    if (item.spent <= 0) continue;
    out[item.email] = `${sign}${item.spent}`;
  }
  return out;
}

export function awardDeltas(awards: readonly TokenAward[] | null | undefined): Record<string, string> {
  const sums = new Map<string, number>();
  for (const award of awards ?? []) {
    sums.set(award.email, (sums.get(award.email) ?? 0) + award.amount);
  }
  const out: Record<string, string> = {};
  for (const [email, amount] of sums) {
    if (amount > 0) out[email] = `+${amount}`;
  }
  return out;
}

/** Parses labels like `-2` or `+3`. */
export function parseDeltaLabel(label: string | undefined): number {
  if (!label || !/^[-+]\d+$/.test(label)) return 0;
  return Number(label);
}

/**
 * When match tokens already include the delta (bid reveal / awards), peel it back
 * so the roster lists can re-apply it for display.
 */
export function playersBeforeDeltas(
  players: readonly RosterPlayer[],
  deltas: Record<string, string> | undefined,
): RosterPlayer[] {
  if (!deltas || Object.keys(deltas).length === 0) return players.map((player) => ({ ...player }));
  return players.map((player) => ({
    ...player,
    tokens: player.tokens - parseDeltaLabel(deltas[player.email]),
  }));
}
