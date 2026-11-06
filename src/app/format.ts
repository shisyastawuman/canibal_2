import type { GameError, Phase, Rules } from '../game';
import { MIN_PLAYERS, nomineeCount, rewards, roundCount } from '../game';

const ERRORS: Record<GameError, string> = {
  not_facilitator: 'No sos el facilitador de esta partida.',
  wrong_phase: 'Esa acción no corresponde a esta fase.',
  invalid_registration: 'Ingresá un nombre y un email.',
  roster_locked: 'La partida ya comenzó. No se aceptan nuevos jugadores.',
  roster_size: 'Hacen falta entre 3 y 60 jugadores.',
  not_enough_prompts: 'Faltan consignas para la cantidad de rondas.',
  invalid_rules: 'Esos números no sirven para una partida.',
  unknown_player: 'Ese email no está en la partida.',
  not_active: 'Los jugadores despedidos no pujan.',
  invalid_bid: 'La puja tiene que ser un número entero.',
  bid_exceeds_tokens: 'No te alcanzan las fichas.',
  clock_expired: 'El reloj ya terminó.',
  clock_still_running: 'El reloj sigue corriendo.',
  invalid_bonus: 'El bono supera el máximo de la partida o no se reparte entre nominados.',
  nominee_cannot_vote: 'Los nominados no votan.',
  invalid_vote: 'Ese voto no es válido.',
  vote_exceeds_tokens: 'No te alcanzan las fichas.',
  last_round: 'No hay otra ronda.',
};

export function errorText(error: GameError): string {
  return ERRORS[error];
}

export function actionError(error: GameError | 'offline'): string {
  if (error === 'offline') return 'No hay conexión. Probá de nuevo en un momento.';
  return ERRORS[error];
}

export function formatClock(deadline: number, now: number): string {
  const total = Math.max(0, Math.ceil((deadline - now) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const PHASES: Record<Phase, string> = {
  lobby: 'Sala de espera',
  reveal_prompt: 'Consigna',
  immunity_bid: 'Puja',
  reveal_bid: 'Pujas',
  prep: 'Preparación',
  speeches: 'Discursos',
  facilitator_bonus: 'Bono',
  vote: 'Votación',
  reveal_vote: 'Resultados',
  round_end: 'Recompensas',
  victory: 'Fin de la partida',
};

export function phaseName(phase: Phase): string {
  return PHASES[phase];
}

export function roundChip(phase: Phase, round: number, rosterSize: number | null, rules: Rules = rewards): string {
  if (phase === 'lobby') return 'Sala de espera';
  if (phase === 'victory') return 'Fin de la partida';
  const total = rosterSize === null ? '?' : roundCount(rosterSize, rules);
  return `Ronda ${round}/${total} · ${PHASES[phase]}`;
}

export function slots(rosterSize: number | null, round: number, rules: Rules = rewards): number {
  if (rosterSize === null || round < 1) return 0;
  return nomineeCount(rosterSize, round, rules);
}

export function isLastRound(rosterSize: number | null, round: number, rules: Rules = rewards): boolean {
  return rosterSize !== null && round >= roundCount(rosterSize, rules);
}

export function nameOf(players: readonly { email: string; name: string }[], email: string): string {
  return players.find((p) => p.email === email)?.name ?? email;
}

export function rankLabel(rank: number | null): string {
  return rank === null ? '—' : `#${rank}`;
}

export function tokenLabel(count: number): string {
  return `${count} ${count === 1 ? 'ficha' : 'fichas'}`;
}

export function freeTokenLabel(count: number): string {
  return count === 1 ? '1 ficha libre' : `${count} fichas libres`;
}

export function winnerRuleText(rules: Rules = rewards): string {
  const bands = rules.firedWinnerBands
    .map((band, index) => {
      const previous = rules.firedWinnerBands[index - 1];
      const from = previous ? previous.rosterUpTo + 1 : MIN_PLAYERS;
      const players = index === 0 ? ' jugadores' : '';
      return `${from}–${band.rosterUpTo}${players}: ${band.seats}`;
    })
    .join(' · ');
  return `Los ${rules.activePlayersWhoWin} activos que quedan ganan. Se suman los despedidos con más fichas permanentes (las libres no cuentan). ${bands}.`;
}

export function tokenBounds(counts: readonly number[]): { least: number; most: number } {
  let least = Infinity;
  let most = -Infinity;
  for (const count of counts) {
    if (count < least) least = count;
    if (count > most) most = count;
  }
  if (!Number.isFinite(least) || !Number.isFinite(most)) return { least: 0, most: 0 };
  return { least, most };
}

/** 0 is the fewest tokens in the list, 1 the most. Null when every total matches. */
export function tokenWealth(tokens: number, least: number, most: number): number | null {
  if (most <= least) return null;
  return (tokens - least) / (most - least);
}

/** Soft row wash: gray at 0, light→dark green by wealth; strength is alpha only. */
export function rosterRowWash(tokens: number, least: number, most: number): string | undefined {
  if (tokens <= 0) return 'rgba(158, 158, 158, 0.2)';
  const wealth = tokenWealth(tokens, least, most);
  if (wealth === null) return undefined;
  const r = Math.round(200 + (27 - 200) * wealth);
  const g = Math.round(230 + (94 - 230) * wealth);
  const b = Math.round(201 + (32 - 201) * wealth);
  const a = 0.12 + wealth * 0.3;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
