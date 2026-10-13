import type { PlayerInMatch } from './types';

/** Renumbers active players 1..n, keeping their order. Fired players have no rank. */
export function compactRanks(players: PlayerInMatch[]): PlayerInMatch[] {
  const order = players
    .filter((p) => p.status === 'active' && p.rank !== null)
    .sort((a, b) => a.rank! - b.rank!)
    .map((p) => p.email);
  return players.map((p) => (p.status === 'active' ? { ...p, rank: order.indexOf(p.email) + 1 } : { ...p, rank: null }));
}

/** Moves a player up by up to `places`, capped at #1; each player passed moves down one. */
export function moveUp(players: PlayerInMatch[], email: string, places: number): PlayerInMatch[] {
  const mover = players.find((p) => p.email === email);
  if (!mover || mover.rank === null) return players;
  const from = mover.rank;
  const to = Math.max(1, from - places);
  return players.map((p) => {
    if (p.email === email) return { ...p, rank: to };
    if (p.rank !== null && p.rank >= to && p.rank < from) return { ...p, rank: p.rank + 1 };
    return p;
  });
}
