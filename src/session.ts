import type { BonusAllocation, GameError, HistoryEntry, Match, Prompt, Rules, VoteAllocation } from './game';

export type { HistoryEntry };

export interface OpenMatch {
  code: string;
  phase: Match['phase'];
  playerCount: number;
}

export interface Session {
  prompts: Prompt[];
  history: HistoryEntry[];
  matches: Record<string, Match>;
  openMatches: OpenMatch[];
  promptSeq: number;
  ready: boolean;
  offline: boolean;
  missing: Record<string, boolean>;
  catalogUpdatedAt: number;
}

export type ActionError = GameError | 'offline';
export type ActionResult = { ok: true; match: Match } | { ok: false; error: ActionError };

const API = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const FAC_KEY = 'canibal-facilitator-ids';
const POLL_MS = 1000;

const listeners = new Set<() => void>();
const matchVersion = new Map<string, number>();
let catalogVersion = 0;
let polling = false;
let queued = false;
let wired = false;
let timer = 0;
let snapshot: Session = empty();

function empty(): Session {
  return {
    prompts: [],
    history: [],
    matches: {},
    openMatches: [],
    promptSeq: 0,
    ready: false,
    offline: false,
    missing: {},
    catalogUpdatedAt: 0,
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

function patch(next: Partial<Session>): void {
  snapshot = { ...snapshot, ...next };
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  ensurePolling();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.clearInterval(timer);
  };
}

export function getSnapshot(): Session {
  return snapshot;
}

export function facilitatorId(code: string): string | null {
  return readIds()[code] ?? null;
}

export function rememberedPlayer(code: string): { email: string; name: string } | null {
  const stored = readJson<{ email?: string; name?: string }>(localStorage.getItem(playerKey(code)));
  if (stored?.email) return { email: stored.email, name: stored.name ?? '' };
  const legacy = readJson<{ email?: string; name?: string }>(sessionStorage.getItem(playerKey(code)));
  if (!legacy?.email) return null;
  localStorage.setItem(playerKey(code), JSON.stringify({ email: legacy.email, name: legacy.name ?? '' }));
  return { email: legacy.email, name: legacy.name ?? '' };
}

export function rememberPlayer(code: string, email: string, name: string): void {
  localStorage.setItem(playerKey(code), JSON.stringify({ email, name }));
}

export function forgetPlayer(code: string): void {
  localStorage.removeItem(playerKey(code));
  sessionStorage.removeItem(playerKey(code));
}

export async function claimFacilitator(code: string, id: string): Promise<{ ok: true } | { ok: false; error: 'not_facilitator' | 'offline' }> {
  const clean = id.trim();
  if (!clean) return { ok: false, error: 'not_facilitator' };
  const response = await request(`/api/matches/${encodeURIComponent(code)}`, { 'x-facilitator-id': clean });
  if (response === 'offline') return { ok: false, error: 'offline' };
  if (!response.body.ok || response.body.match?.facilitatorId !== clean) return { ok: false, error: 'not_facilitator' };
  rememberFacilitator(code, clean);
  adoptMatch(code, response.body.match as Match, numberOrZero(response.body.updatedAt));
  return { ok: true };
}

export async function createNewMatch(promptIds: string[], rules: Rules): Promise<{ ok: true; code: string } | { ok: false; error: ActionError }> {
  const response = await request('/api/matches', {}, { method: 'POST', body: JSON.stringify({ promptIds, rules }) });
  if (response === 'offline') return { ok: false, error: 'offline' };
  if (!response.body.ok || typeof response.body.code !== 'string' || !response.body.match) {
    return { ok: false, error: (response.body.error as GameError) ?? 'not_enough_prompts' };
  }
  rememberFacilitator(response.body.code, response.body.match.facilitatorId as string);
  adoptMatch(response.body.code, response.body.match as Match, numberOrZero(response.body.updatedAt));
  return { ok: true, code: response.body.code };
}

export async function registerPlayer(code: string, name: string, email: string): Promise<ActionResult> {
  const result = await send(code, { type: 'join', name, email }, { email });
  if (result.ok) {
    const player = result.match.players.find((item) => item.email === email.trim().toLowerCase());
    rememberPlayer(code, player?.email ?? email.trim().toLowerCase(), player?.name ?? name.trim());
    emit();
  }
  return result;
}

export async function placeBid(code: string, email: string, amount: number): Promise<ActionResult> {
  return send(code, { type: 'setBid', email, amount }, { email });
}

export async function placeVote(code: string, email: string, allocation: VoteAllocation[]): Promise<ActionResult> {
  return send(code, { type: 'setVote', email, allocation }, { email });
}

export async function assignBonus(code: string, facilitatorId: string, allocation: BonusAllocation[]): Promise<ActionResult> {
  return send(code, { type: 'assignBonus', facilitatorId, allocation }, { facilitatorId });
}

export async function tick(code: string): Promise<void> {
  const auth = authFor(code);
  await send(code, { type: 'tick' }, auth);
}

export const facilitator = {
  reveal: (code: string, id: string) => send(code, { type: 'reveal', facilitatorId: id }, { facilitatorId: id }),
  startBid: (code: string, id: string) => send(code, { type: 'startBid', facilitatorId: id }, { facilitatorId: id }),
  extendBid: (code: string, id: string) => send(code, { type: 'extendBid', facilitatorId: id }, { facilitatorId: id }),
  closeBid: (code: string, id: string) => send(code, { type: 'closeBid', facilitatorId: id }, { facilitatorId: id }),
  startPrep: (code: string, id: string) => send(code, { type: 'startPrep', facilitatorId: id }, { facilitatorId: id }),
  extendPrep: (code: string, id: string) => send(code, { type: 'extendPrep', facilitatorId: id }, { facilitatorId: id }),
  closePrep: (code: string, id: string) => send(code, { type: 'closePrep', facilitatorId: id }, { facilitatorId: id }),
  startSpeech: (code: string, id: string) => send(code, { type: 'startSpeech', facilitatorId: id }, { facilitatorId: id }),
  extendSpeech: (code: string, id: string) => send(code, { type: 'extendSpeech', facilitatorId: id }, { facilitatorId: id }),
  closeSpeech: (code: string, id: string) => send(code, { type: 'closeSpeech', facilitatorId: id }, { facilitatorId: id }),
  startVote: (code: string, id: string) => send(code, { type: 'startVote', facilitatorId: id }, { facilitatorId: id }),
  extendVote: (code: string, id: string) => send(code, { type: 'extendVote', facilitatorId: id }, { facilitatorId: id }),
  closeVote: (code: string, id: string) => send(code, { type: 'closeVote', facilitatorId: id }, { facilitatorId: id }),
  advance: (code: string, id: string) => send(code, { type: 'advance', facilitatorId: id }, { facilitatorId: id }),
};

export async function createPrompt(text: string): Promise<{ ok: true } | { ok: false; error: 'invalid_prompt' | 'offline' }> {
  const response = await request('/api/prompts', {}, { method: 'POST', body: JSON.stringify({ text }) });
  if (response === 'offline') return { ok: false, error: 'offline' };
  if (!response.body.ok) return { ok: false, error: 'invalid_prompt' };
  await refresh();
  return { ok: true };
}

export async function editPrompt(id: string, text: string): Promise<{ ok: true } | { ok: false; error: 'invalid_prompt' | 'unknown_prompt' | 'offline' }> {
  const response = await request(`/api/prompts/${encodeURIComponent(id)}`, {}, { method: 'PATCH', body: JSON.stringify({ text }) });
  if (response === 'offline') return { ok: false, error: 'offline' };
  if (!response.body.ok) return { ok: false, error: response.body.error === 'unknown_prompt' ? 'unknown_prompt' : 'invalid_prompt' };
  await refresh();
  return { ok: true };
}

export async function removePrompt(id: string): Promise<{ ok: true } | { ok: false; error: 'unknown_prompt' | 'offline' }> {
  const response = await request(`/api/prompts/${encodeURIComponent(id)}`, {}, { method: 'DELETE' });
  if (response === 'offline') return { ok: false, error: 'offline' };
  if (!response.body.ok) return { ok: false, error: 'unknown_prompt' };
  await refresh();
  return { ok: true };
}

function ensurePolling(): void {
  void refresh();
  window.clearInterval(timer);
  timer = window.setInterval(() => void refresh(), POLL_MS);
  if (wired) return;
  wired = true;
  window.addEventListener('focus', onWake);
  window.addEventListener('online', onWake);
  document.addEventListener('visibilitychange', onWake);
}

function onWake(): void {
  if (document.visibilityState === 'hidden') return;
  void refresh();
}

export async function refresh(): Promise<void> {
  if (polling) {
    queued = true;
    return;
  }
  polling = true;
  try {
    await pull();
  } finally {
    polling = false;
    if (queued) {
      queued = false;
      void refresh();
    }
  }
}

async function pull(): Promise<void> {
  const session = await request('/api/session');
  if (session === 'offline') {
    patch({ offline: true, ready: true });
    return;
  }
  const catalogUpdatedAt = numberOrZero(session.body.catalogUpdatedAt);
  if (catalogUpdatedAt >= catalogVersion) {
    catalogVersion = catalogUpdatedAt;
    patch({
      prompts: (session.body.prompts as Prompt[]) ?? [],
      history: (session.body.history as HistoryEntry[]) ?? [],
      openMatches: (session.body.openMatches as OpenMatch[]) ?? [],
      promptSeq: numberOrZero(session.body.promptSeq),
      catalogUpdatedAt,
      offline: false,
      ready: true,
    });
  } else {
    patch({ offline: false, ready: true });
  }

  const watched = watchTarget();
  if (!watched || watched.role === 'home') return;
  const auth = authFor(watched.code);
  const response = await request(`/api/matches/${encodeURIComponent(watched.code)}`, auth.headers);
  if (response === 'offline') {
    patch({ offline: true });
    return;
  }
  if (response.status === 404) {
    patch({ missing: { ...snapshot.missing, [watched.code]: true }, offline: false });
    return;
  }
  if (response.status === 403 && auth.headers['x-facilitator-id']) {
    const pub = await request(`/api/matches/${encodeURIComponent(watched.code)}`);
    if (pub !== 'offline' && pub.body.ok && pub.body.match) adoptMatch(watched.code, pub.body.match as Match, numberOrZero(pub.body.updatedAt));
    return;
  }
  if (response.body.ok && response.body.match) adoptMatch(watched.code, response.body.match as Match, numberOrZero(response.body.updatedAt));
}

async function send(code: string, body: object, auth: { email?: string; facilitatorId?: string }): Promise<ActionResult> {
  const headers: Record<string, string> = {};
  if (auth.email) headers['x-player-email'] = auth.email;
  if (auth.facilitatorId) headers['x-facilitator-id'] = auth.facilitatorId;
  const response = await request(`/api/matches/${encodeURIComponent(code)}/commands`, headers, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (response === 'offline') return { ok: false, error: 'offline' };
  if (response.body.match) adoptMatch(code, response.body.match as Match, numberOrZero(response.body.updatedAt));
  if (response.status === 404) {
    patch({ missing: { ...snapshot.missing, [code]: true } });
    return { ok: false, error: 'wrong_phase' };
  }
  if (!response.body.ok) return { ok: false, error: (response.body.error as GameError) ?? 'wrong_phase' };
  return { ok: true, match: response.body.match as Match };
}

function adoptMatch(code: string, match: Match, updatedAt: number): void {
  const seen = matchVersion.get(code) ?? -1;
  const current = snapshot.matches[code];
  if (updatedAt < seen) return;
  if (updatedAt === seen && current && keepsMore(current, match)) return;
  matchVersion.set(code, updatedAt);
  snapshot = {
    ...snapshot,
    offline: false,
    ready: true,
    missing: { ...snapshot.missing, [code]: false },
    matches: { ...snapshot.matches, [code]: match },
  };
  emit();
}

function keepsMore(current: Match, incoming: Match): boolean {
  if (current.facilitatorId && !incoming.facilitatorId) return true;
  const detail = (match: Match) => match.players.some((player) => player.votes.length > 0 || player.immunityBid > 0);
  return detail(current) && !detail(incoming);
}

function watchTarget(): { role: 'home' } | { role: 'match'; code: string } | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  const routed = path.match(/^\/(m|j|p)\/([^/]+)\/?$/);
  if (!routed?.[2]) return { role: 'home' };
  return { role: 'match', code: decodeURIComponent(routed[2]) };
}

function authFor(code: string): { headers: Record<string, string>; email?: string; facilitatorId?: string } {
  const path = window.location.pathname;
  if (path.startsWith('/m/')) {
    const id = facilitatorId(code);
    return id ? { headers: { 'x-facilitator-id': id }, facilitatorId: id } : { headers: {} };
  }
  if (path.startsWith('/j/')) {
    const player = rememberedPlayer(code);
    return player ? { headers: { 'x-player-email': player.email }, email: player.email } : { headers: {} };
  }
  return { headers: {} };
}

interface ApiBody {
  ok?: boolean;
  error?: string;
  code?: string;
  match?: Match & { facilitatorId?: string };
  updatedAt?: number;
  prompts?: Prompt[];
  history?: HistoryEntry[];
  openMatches?: OpenMatch[];
  promptSeq?: number;
  catalogUpdatedAt?: number;
}

async function request(path: string, headers: Record<string, string> = {}, init: RequestInit = {}): Promise<{ status: number; body: ApiBody } | 'offline'> {
  try {
    const response = await fetch(`${API}${path}`, {
      ...init,
      cache: 'no-store',
      headers: { 'content-type': 'application/json', ...headers, ...(init.headers ?? {}) },
    });
    const body = (await response.json().catch(() => ({}))) as ApiBody;
    return { status: response.status, body };
  } catch {
    return 'offline';
  }
}

function rememberFacilitator(code: string, id: string): void {
  const map = readIds();
  map[code] = id;
  localStorage.setItem(FAC_KEY, JSON.stringify(map));
}

function readIds(): Record<string, string> {
  const parsed = readJson<Record<string, string>>(localStorage.getItem(FAC_KEY));
  return parsed ?? {};
}

function readJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function playerKey(code: string): string {
  return `canibal-player:${code}`;
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => void refresh());
}
