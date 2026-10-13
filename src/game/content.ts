import type { Prompt } from './types';

export type ContentError = 'invalid_prompt' | 'unknown_prompt';
export type ContentResult = { ok: true; prompts: Prompt[] } | { ok: false; error: ContentError };

export function addPrompt(prompts: Prompt[], id: string, text: string): ContentResult {
  const clean = text.trim();
  if (!clean || !id) return { ok: false, error: 'invalid_prompt' };
  return { ok: true, prompts: [...prompts, { id, text: clean }] };
}

export function updatePrompt(prompts: Prompt[], id: string, text: string): ContentResult {
  const clean = text.trim();
  if (!clean) return { ok: false, error: 'invalid_prompt' };
  if (!prompts.some((p) => p.id === id)) return { ok: false, error: 'unknown_prompt' };
  return { ok: true, prompts: prompts.map((p) => (p.id === id ? { ...p, text: clean } : p)) };
}

export function deletePrompt(prompts: Prompt[], id: string): ContentResult {
  if (!prompts.some((p) => p.id === id)) return { ok: false, error: 'unknown_prompt' };
  return { ok: true, prompts: prompts.filter((p) => p.id !== id) };
}
