import type { GameError, Phase } from '../game';
import { nomineeCount, roundCount } from '../game';

const ERRORS: Record<GameError, string> = {
  not_facilitator: 'No sos el facilitador de esta partida.',
  wrong_phase: 'Esa acción no corresponde a esta fase.',
  invalid_registration: 'Ingresá un nombre y un email.',
  roster_locked: 'La partida ya comenzó. No se aceptan nuevos jugadores.',
  roster_size: 'Hacen falta entre 7 y 60 jugadores.',
  not_enough_prompts: 'Faltan consignas para la cantidad de rondas.',
  unknown_player: 'Ese email no está en la partida.',
  not_active: 'Los jugadores despedidos no pujan.',
  invalid_bid: 'La puja tiene que ser un número entero.',
  bid_exceeds_tokens: 'No te alcanzan las fichas.',
  clock_expired: 'El reloj ya terminó.',
  clock_still_running: 'El reloj sigue corriendo.',
  invalid_bonus: 'El bono no puede pasar de 5 fichas y solo se reparte entre nominados.',
  nominee_cannot_vote: 'Los nominados no votan.',
  invalid_vote: 'Ese voto no es válido.',
  vote_exceeds_tokens: 'No te alcanzan las fichas de influencia.',
  vote_exceeds_special_tokens: 'No te alcanzan las fichas especiales.',
  last_round: 'No hay otra ronda.',
};

export function errorText(error: GameError): string {
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
  round_end: 'Resultados',
  victory: 'Fin de la partida',
};

export function phaseName(phase: Phase): string {
  return PHASES[phase];
}

export function roundChip(phase: Phase, round: number, rosterSize: number | null): string {
  if (phase === 'lobby') return 'Sala de espera';
  if (phase === 'victory') return 'Fin de la partida';
  const total = rosterSize === null ? '?' : roundCount(rosterSize);
  return `Ronda ${round}/${total} · ${PHASES[phase]}`;
}

export function slots(rosterSize: number | null, round: number): number {
  if (rosterSize === null || round < 1) return 0;
  return nomineeCount(rosterSize, round);
}

export function isLastRound(rosterSize: number | null, round: number): boolean {
  return rosterSize !== null && round >= roundCount(rosterSize);
}

export function nameOf(players: readonly { email: string; name: string }[], email: string): string {
  return players.find((p) => p.email === email)?.name ?? email;
}

export function rankLabel(rank: number | null): string {
  return rank === null ? '—' : `#${rank}`;
}
