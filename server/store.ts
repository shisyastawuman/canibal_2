import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createMatch, toHistoryEntry } from '../src/game';
import type { Rules } from '../src/game';
import type { GameError, HistoryEntry, Match, Phase, Prompt, Rng } from '../src/game';
import { applyCommand, type Command } from './apply';
import { expire } from './expire';
import { SEED_PROMPTS } from './prompts';

const SEED: Prompt[] = SEED_PROMPTS;

export interface OpenMatch {
  code: string;
  phase: Phase;
  playerCount: number;
}

export interface Snapshot {
  prompts: Prompt[];
  promptSeq: number;
  history: HistoryEntry[];
  openMatches: OpenMatch[];
  catalogUpdatedAt: number;
}

export interface SavedMatch {
  match: Match;
  updatedAt: number;
}

export type CommandOutcome =
  | { ok: true; saved: SavedMatch }
  | { ok: false; error: GameError; saved: SavedMatch | null }
  | { ok: false; error: 'unknown_match' };

interface Slot {
  match: Match;
  updatedAt: number;
}

interface AppState {
  promptSeq: number;
  prompts: Prompt[];
  history: HistoryEntry[];
  matches: Record<string, Slot>;
  catalogUpdatedAt: number;
}

export interface Store {
  kind: string;
  snapshot(): Promise<Snapshot>;
  createMatch(promptIds: string[], rng: Rng, rules?: Rules): Promise<{ ok: true; saved: SavedMatch } | { ok: false; error: GameError }>;
  command(code: string, command: Command, rng: Rng, now?: number): Promise<CommandOutcome>;
  addPrompt(text: string): Promise<{ ok: true; prompts: Prompt[] } | { ok: false; error: 'invalid_prompt' }>;
  editPrompt(id: string, text: string): Promise<{ ok: true; prompts: Prompt[] } | { ok: false; error: 'invalid_prompt' | 'unknown_prompt' }>;
  removePrompt(id: string): Promise<{ ok: true; prompts: Prompt[] } | { ok: false; error: 'unknown_prompt' }>;
}

function seedState(): AppState {
  return {
    promptSeq: SEED.length,
    prompts: SEED.map((prompt) => ({ ...prompt })),
    history: [],
    matches: {},
    catalogUpdatedAt: 1,
  };
}

function snapshotOf(state: AppState): Snapshot {
  const openMatches = Object.values(state.matches)
    .map((slot) => slot.match)
    .filter((match) => match.phase !== 'victory')
    .map((match) => ({ code: match.code, phase: match.phase, playerCount: match.players.length }));
  return {
    prompts: state.prompts,
    promptSeq: state.promptSeq,
    history: state.history,
    openMatches,
    catalogUpdatedAt: state.catalogUpdatedAt,
  };
}

/** One in-process queue. Concurrent votes on a match run one after another and all land. */
export function createMemoryStore(): Store {
  return createLockedStore(seedState(), async () => {}, 'memory');
}

export async function createFileStore(file: string): Promise<Store> {
  await mkdir(dirname(file), { recursive: true });
  let state = seedState();
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<AppState>;
    if (Array.isArray(parsed.prompts) && parsed.matches && typeof parsed.matches === 'object') {
      state = {
        promptSeq: typeof parsed.promptSeq === 'number' ? parsed.promptSeq : parsed.prompts.length,
        prompts: parsed.prompts,
        history: Array.isArray(parsed.history) ? parsed.history : [],
        matches: parsed.matches,
        catalogUpdatedAt: typeof parsed.catalogUpdatedAt === 'number' ? parsed.catalogUpdatedAt : 1,
      };
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }
  return createLockedStore(state, () => persist(file, state), 'file');
}

function createLockedStore(state: AppState, persist: () => Promise<void>, kind: string): Store {
  let chain: Promise<void> = Promise.resolve();
  let dirty = false;
  let version = Date.now();

  function nextVersion(): number {
    version = Math.max(version + 1, Date.now());
    return version;
  }

  function transact<T>(fn: () => T): Promise<T> {
    const run = chain.then(async () => {
      dirty = false;
      const result = fn();
      if (dirty) await persist();
      return result;
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function saveMatch(match: Match): SavedMatch {
    const updatedAt = nextVersion();
    const saved = { match, updatedAt };
    state.matches[match.code] = saved;
    dirty = true;
    if (match.phase === 'victory' && !state.history.some((entry) => entry.code === match.code)) {
      state.history = [toHistoryEntry(match, updatedAt), ...state.history];
    }
    return saved;
  }

  return {
    kind,
    snapshot: () => transact(() => snapshotOf(state)),
    createMatch: (promptIds, rng, rules) =>
      transact(() => {
        const prompts = promptIds.flatMap((id) => {
          const prompt = state.prompts.find((item) => item.id === id);
          return prompt ? [prompt] : [];
        });
        if (prompts.length === 0) return { ok: false as const, error: 'not_enough_prompts' as const };
        let match = createMatch(prompts, rng, rules);
        for (let attempt = 0; attempt < 5 && state.matches[match.code]; attempt++) match = createMatch(prompts, rng, rules);
        return { ok: true as const, saved: saveMatch(match) };
      }),
    command: (code, command, rng, now = Date.now()) =>
      transact(() => {
        const slot = state.matches[code];
        if (!slot) return { ok: false as const, error: 'unknown_match' as const };
        const current = expire(slot.match, now);
        const result = applyCommand(current, command, now, rng);
        if (!result.ok) {
          const saved = current === slot.match ? slot : saveMatch(current);
          return { ok: false as const, error: result.error, saved };
        }
        const saved = result.match === slot.match ? slot : saveMatch(result.match);
        return { ok: true as const, saved };
      }),
    addPrompt: (text) =>
      transact(() => {
        const clean = text.trim();
        if (!clean) return { ok: false as const, error: 'invalid_prompt' as const };
        state.promptSeq += 1;
        state.prompts = [...state.prompts, { id: `pr-${state.promptSeq}`, text: clean }];
        state.catalogUpdatedAt = Date.now();
        dirty = true;
        return { ok: true as const, prompts: state.prompts };
      }),
    editPrompt: (id, text) =>
      transact(() => {
        const clean = text.trim();
        if (!clean) return { ok: false as const, error: 'invalid_prompt' as const };
        if (!state.prompts.some((prompt) => prompt.id === id)) return { ok: false as const, error: 'unknown_prompt' as const };
        state.prompts = state.prompts.map((prompt) => (prompt.id === id ? { ...prompt, text: clean } : prompt));
        state.catalogUpdatedAt = Date.now();
        dirty = true;
        return { ok: true as const, prompts: state.prompts };
      }),
    removePrompt: (id) =>
      transact(() => {
        if (!state.prompts.some((prompt) => prompt.id === id)) return { ok: false as const, error: 'unknown_prompt' as const };
        state.prompts = state.prompts.filter((prompt) => prompt.id !== id);
        state.catalogUpdatedAt = Date.now();
        dirty = true;
        return { ok: true as const, prompts: state.prompts };
      }),
  };
}

async function persist(file: string, state: AppState): Promise<void> {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(state));
  try {
    await rename(tmp, file);
  } catch {
    await unlink(file).catch(() => undefined);
    await rename(tmp, file);
  }
}
