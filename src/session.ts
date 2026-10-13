import { addPrompt, deletePrompt, updatePrompt } from './game/content';
import {
  closeImmunityBid,
  closePrep,
  closeSpeech,
  closeVote,
  createMatch,
  endRound,
  extendBidClock,
  extendPrepClock,
  extendSpeechClock,
  extendVoteClock,
  joinMatch,
  revealFirstPrompt,
  startBidClock,
  startNextRound,
  startPrepClock,
  startSpeechClock,
  startVoteClock,
  toHistoryEntry,
} from './game';
import type { HistoryEntry } from './game/victory';
import type { GameError, Match, Prompt, Result } from './game/types';

export type { HistoryEntry };

export interface Session {
  prompts: Prompt[];
  history: HistoryEntry[];
  matches: Record<string, Match>;
  promptSeq: number;
}

const KEY = 'canibal-session-v1';
const FAC_KEY = 'canibal-facilitator-ids';

const SEED: Prompt[] = [
  { id: 'seed-1', text: 'Convencé al directorio de que tu área no debe sufrir recortes este año.' },
  { id: 'seed-2', text: 'Contá un error que cometiste y qué aprendió tu equipo de él.' },
  { id: 'seed-3', text: 'Defendé una decisión impopular que tomaste por el bien del equipo.' },
  { id: 'seed-4', text: 'Explicá cómo repartirías un presupuesto que alcanza para un solo proyecto.' },
  { id: 'seed-5', text: 'Convencé a un colega de cambiar un hábito que frena al equipo.' },
  { id: 'seed-6', text: 'Contá una mala noticia y qué harías en los próximos treinta días.' },
  { id: 'seed-7', text: 'Proponé una regla nueva para las reuniones y defendela en un minuto.' },
];

const listeners = new Set<() => void>();
let snapshot: Session = readStored() ?? emptySession();
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('canibal-2');

function emptySession(): Session {
  return { prompts: SEED, history: [], matches: {}, promptSeq: SEED.length };
}

function readStored(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.prompts || !parsed.matches || !parsed.history) return null;
    return parsed;
  } catch {
    return null;
  }
}

function fresh(): Session {
  snapshot = readStored() ?? snapshot;
  return snapshot;
}

function commit(next: Session): void {
  snapshot = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  channel?.postMessage(1);
  for (const listener of listeners) listener();
}

channel?.addEventListener('message', () => {
  snapshot = readStored() ?? snapshot;
  for (const listener of listeners) listener();
});

window.addEventListener('storage', (event) => {
  if (event.key !== KEY) return;
  snapshot = readStored() ?? snapshot;
  for (const listener of listeners) listener();
});

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): Session {
  return snapshot;
}

export function updateMatch(code: string, fn: (match: Match) => Result): Result {
  const session = fresh();
  const match = session.matches[code];
  if (!match) return { ok: false, error: 'wrong_phase' };
  const result = fn(match);
  if (!result.ok || result.match === match) return result;
  let history = session.history;
  if (result.match.phase === 'victory' && !history.some((entry) => entry.code === code)) {
    history = [toHistoryEntry(result.match, Date.now()), ...history];
  }
  commit({ ...session, history, matches: { ...session.matches, [code]: result.match } });
  return result;
}

export function facilitatorId(code: string): string | null {
  try {
    const map = JSON.parse(localStorage.getItem(FAC_KEY) ?? '{}') as Record<string, string>;
    return map[code] ?? null;
  } catch {
    return null;
  }
}

export function claimFacilitator(code: string, id: string): boolean {
  const match = fresh().matches[code];
  const clean = id.trim();
  if (!match || match.facilitatorId !== clean) return false;
  const map = JSON.parse(localStorage.getItem(FAC_KEY) ?? '{}') as Record<string, string>;
  map[code] = clean;
  localStorage.setItem(FAC_KEY, JSON.stringify(map));
  return true;
}

function rememberFacilitator(code: string, id: string): void {
  const map = JSON.parse(localStorage.getItem(FAC_KEY) ?? '{}') as Record<string, string>;
  map[code] = id;
  localStorage.setItem(FAC_KEY, JSON.stringify(map));
}

export function rememberedPlayer(code: string): { email: string; name: string } | null {
  try {
    const raw = sessionStorage.getItem(`canibal-player:${code}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string; name?: string };
    if (!parsed.email) return null;
    return { email: parsed.email, name: parsed.name ?? '' };
  } catch {
    return null;
  }
}

export function rememberPlayer(code: string, email: string, name: string): void {
  sessionStorage.setItem(`canibal-player:${code}`, JSON.stringify({ email, name }));
}

export function forgetPlayer(code: string): void {
  sessionStorage.removeItem(`canibal-player:${code}`);
}

export function createPrompt(text: string): { ok: true } | { ok: false; error: 'invalid_prompt' | 'unknown_prompt' } {
  const session = fresh();
  const id = `pr-${session.promptSeq + 1}`;
  const result = addPrompt(session.prompts, id, text);
  if (!result.ok) return result;
  commit({ ...session, prompts: result.prompts, promptSeq: session.promptSeq + 1 });
  return { ok: true };
}

export function editPrompt(id: string, text: string): { ok: true } | { ok: false; error: 'invalid_prompt' | 'unknown_prompt' } {
  const session = fresh();
  const result = updatePrompt(session.prompts, id, text);
  if (!result.ok) return result;
  commit({ ...session, prompts: result.prompts });
  return { ok: true };
}

export function removePrompt(id: string): { ok: true } | { ok: false; error: 'invalid_prompt' | 'unknown_prompt' } {
  const session = fresh();
  const result = deletePrompt(session.prompts, id);
  if (!result.ok) return result;
  commit({ ...session, prompts: result.prompts });
  return { ok: true };
}

export function createNewMatch(promptIds: string[]): { ok: true; code: string } | { ok: false; error: GameError } {
  const session = fresh();
  const prompts = promptIds.flatMap((id) => {
    const prompt = session.prompts.find((item) => item.id === id);
    return prompt ? [prompt] : [];
  });
  if (prompts.length === 0) return { ok: false, error: 'not_enough_prompts' };
  const match = createMatch(prompts, Math.random);
  rememberFacilitator(match.code, match.facilitatorId);
  commit({ ...session, matches: { ...session.matches, [match.code]: match } });
  return { ok: true, code: match.code };
}

export function registerPlayer(code: string, name: string, email: string): Result {
  const result = updateMatch(code, (match) => joinMatch(match, name, email, Math.random));
  if (result.ok) {
    const player = result.match.players.find((item) => item.email === email.trim().toLowerCase());
    rememberPlayer(code, player?.email ?? email.trim().toLowerCase(), player?.name ?? name.trim());
  }
  return result;
}

export const facilitator = {
  reveal: (code: string, id: string) => updateMatch(code, (match) => revealFirstPrompt(match, id)),
  startBid: (code: string, id: string) => updateMatch(code, (match) => startBidClock(match, id, Date.now())),
  extendBid: (code: string, id: string) => updateMatch(code, (match) => extendBidClock(match, id, Date.now())),
  closeBid: (code: string, id: string) => updateMatch(code, (match) => closeImmunityBid(match, Date.now(), id)),
  startPrep: (code: string, id: string) => updateMatch(code, (match) => startPrepClock(match, id, Date.now())),
  extendPrep: (code: string, id: string) => updateMatch(code, (match) => extendPrepClock(match, id, Date.now())),
  closePrep: (code: string, id: string) => updateMatch(code, (match) => closePrep(match, Date.now(), id)),
  startSpeech: (code: string, id: string) => updateMatch(code, (match) => startSpeechClock(match, id, Date.now())),
  extendSpeech: (code: string, id: string) => updateMatch(code, (match) => extendSpeechClock(match, id, Date.now())),
  closeSpeech: (code: string, id: string) => updateMatch(code, (match) => closeSpeech(match, Date.now(), id)),
  startVote: (code: string, id: string) => updateMatch(code, (match) => startVoteClock(match, id, Date.now())),
  extendVote: (code: string, id: string) => updateMatch(code, (match) => extendVoteClock(match, id, Date.now())),
  closeVote: (code: string, id: string) => updateMatch(code, (match) => closeVote(match, Date.now(), id)),
  advance: (code: string, id: string) =>
    updateMatch(code, (match) => {
      const ended = match.phase === 'reveal_vote' ? endRound(match, id) : { ok: true as const, match };
      if (!ended.ok) return ended;
      return startNextRound(ended.match, id);
    }),
};
