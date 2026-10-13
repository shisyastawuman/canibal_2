import { useEffect, useState, useSyncExternalStore } from 'react';
import { closeImmunityBid, closePrep, closeSpeech, closeVote } from '../game';
import type { Match, Phase } from '../game';
import {
  getSnapshot,
  rememberedPlayer,
  subscribe,
  updateMatch,
  type Session,
} from '../session';

export function useSession(): Session {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onChange = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);
  return path;
}

export function navigate(to: string): void {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function usePlayer(code: string): { email: string; name: string } | null {
  useSession();
  return rememberedPlayer(code);
}

/** After a clock's deadline, close that phase. Anyone may close once time is up. */
export function useAutoClose(match: Match | null): void {
  const deadline = match?.clock?.deadline ?? null;
  const phase = match?.phase ?? null;
  const code = match?.code ?? null;
  const speaker = match?.speakerIndex ?? null;
  useEffect(() => {
    if (!code || deadline === null || !phase) return;
    const wait = Math.max(0, deadline - Date.now());
    const timer = window.setTimeout(() => {
      updateMatch(code, (current) => closePhase(current, phase));
    }, wait);
    return () => window.clearTimeout(timer);
  }, [code, deadline, phase, speaker]);
}

function closePhase(match: Match, phase: Phase) {
  if (match.phase !== phase || !match.clock || Date.now() < match.clock.deadline) {
    return { ok: true as const, match };
  }
  const now = Date.now();
  if (phase === 'immunity_bid') return closeImmunityBid(match, now);
  if (phase === 'prep') return closePrep(match, now);
  if (phase === 'speeches') return closeSpeech(match, now);
  if (phase === 'vote') return closeVote(match, now);
  return { ok: true as const, match };
}
