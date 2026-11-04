import { Firestore, type DocumentReference } from '@google-cloud/firestore';
import { createMatch, toHistoryEntry } from '../src/game';
import type { HistoryEntry, Prompt, Rng } from '../src/game';
import { applyCommand, type Command } from './apply';
import { expire } from './expire';
import type { CommandOutcome, SavedMatch, Snapshot, Store } from './store';
import { SEED_PROMPTS } from './prompts';

const SEED: Prompt[] = SEED_PROMPTS;

interface Catalog {
  promptSeq: number;
  prompts: Prompt[];
  catalogUpdatedAt: number;
}

function seedCatalog(): Catalog {
  return { promptSeq: SEED.length, prompts: SEED.map((prompt) => ({ ...prompt })), catalogUpdatedAt: 1 };
}

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Firestore is the shared match. A transaction is the queue across Cloud Run instances. */
export function createFirestoreStore(): Store {
  const db = new Firestore({ ignoreUndefinedProperties: true });
  const catalogRef = db.doc('catalog/main');
  const matches = db.collection('matches');
  const history = db.collection('history');
  let cached: { at: number; value: Snapshot } | null = null;

  function invalidate(): void {
    cached = null;
  }

  async function catalog(): Promise<Catalog> {
    const snap = await catalogRef.get();
    if (!snap.exists) {
      const seeded = seedCatalog();
      await catalogRef.create(seeded).catch(() => undefined);
      const again = await catalogRef.get();
      return (again.data() as Catalog | undefined) ?? seeded;
    }
    return snap.data() as Catalog;
  }

  async function mutateCatalog(fn: (current: Catalog) => Catalog | null): Promise<{ catalog: Catalog; changed: boolean }> {
    const next = await db.runTransaction(async (tx) => {
      const snap = await tx.get(catalogRef);
      const current = snap.exists ? (snap.data() as Catalog) : seedCatalog();
      const updated = fn(current);
      if (!updated) return { catalog: current, changed: false };
      tx.set(catalogRef, plain(updated));
      return { catalog: updated, changed: true };
    });
    invalidate();
    return next;
  }

  return {
    kind: 'firestore',
    async snapshot() {
      if (cached && Date.now() - cached.at < 1000) return cached.value;
      const current = await catalog();
      const [matchSnap, historySnap] = await Promise.all([matches.get(), history.orderBy('finishedAt', 'desc').limit(40).get()]);
      const value: Snapshot = {
        prompts: current.prompts,
        promptSeq: current.promptSeq,
        catalogUpdatedAt: current.catalogUpdatedAt,
        history: historySnap.docs.map((doc) => doc.data() as HistoryEntry),
        openMatches: matchSnap.docs.flatMap((doc) => {
          const saved = doc.data() as SavedMatch;
          if (!saved.match || saved.match.phase === 'victory') return [];
          return [{ code: saved.match.code, phase: saved.match.phase, playerCount: saved.match.players.length }];
        }),
      };
      cached = { at: Date.now(), value };
      return value;
    },
    async createMatch(promptIds, rng, rules) {
      const current = await catalog();
      const prompts = promptIds.flatMap((id) => {
        const prompt = current.prompts.find((item) => item.id === id);
        return prompt ? [prompt] : [];
      });
      if (prompts.length === 0) return { ok: false, error: 'not_enough_prompts' };
      for (let attempt = 0; attempt < 5; attempt++) {
        const match = createMatch(prompts, rng, rules);
        const ref = matches.doc(match.code);
        const saved = await db.runTransaction(async (tx) => {
          const existing = await tx.get(ref);
          if (existing.exists) return null;
          const created: SavedMatch = { match, updatedAt: Date.now() };
          tx.set(ref, plain(created));
          return created;
        });
        if (saved) {
          invalidate();
          return { ok: true, saved };
        }
      }
      return { ok: false, error: 'not_enough_prompts' };
    },
    command: (code, command, rng, now = Date.now()) => commandIn(db, matches.doc(code), history.doc(code), command, rng, now).finally(invalidate),
    async addPrompt(text) {
      const clean = text.trim();
      if (!clean) return { ok: false, error: 'invalid_prompt' };
      const next = await mutateCatalog((current) => ({
        promptSeq: current.promptSeq + 1,
        prompts: [...current.prompts, { id: `pr-${current.promptSeq + 1}`, text: clean }],
        catalogUpdatedAt: Date.now(),
      }));
      return { ok: true, prompts: next.catalog.prompts };
    },
    async editPrompt(id, text) {
      const clean = text.trim();
      if (!clean) return { ok: false, error: 'invalid_prompt' };
      const next = await mutateCatalog((current) => {
        if (!current.prompts.some((prompt) => prompt.id === id)) return null;
        return {
          ...current,
          prompts: current.prompts.map((prompt) => (prompt.id === id ? { ...prompt, text: clean } : prompt)),
          catalogUpdatedAt: Date.now(),
        };
      });
      if (!next.changed) return { ok: false, error: 'unknown_prompt' };
      return { ok: true, prompts: next.catalog.prompts };
    },
    async removePrompt(id) {
      const next = await mutateCatalog((current) => {
        if (!current.prompts.some((prompt) => prompt.id === id)) return null;
        return { ...current, prompts: current.prompts.filter((prompt) => prompt.id !== id), catalogUpdatedAt: Date.now() };
      });
      if (!next.changed) return { ok: false, error: 'unknown_prompt' };
      return { ok: true, prompts: next.catalog.prompts };
    },
  };
}

async function commandIn(
  db: Firestore,
  matchRef: DocumentReference,
  historyRef: DocumentReference,
  command: Command,
  rng: Rng,
  now: number,
): Promise<CommandOutcome> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) return { ok: false as const, error: 'unknown_match' as const };
    const slot = snap.data() as SavedMatch;
    const current = expire(slot.match, now);
    const result = applyCommand(current, command, now, rng);
    if (!result.ok) {
      if (current === slot.match) return { ok: false as const, error: result.error, saved: slot };
      const saved = { match: current, updatedAt: Math.max(slot.updatedAt + 1, now) };
      tx.set(matchRef, plain(saved));
      return { ok: false as const, error: result.error, saved };
    }
    if (result.match === slot.match) return { ok: true as const, saved: slot };
    const saved = { match: result.match, updatedAt: Math.max(slot.updatedAt + 1, now) };
    tx.set(matchRef, plain(saved));
    if (result.match.phase === 'victory') tx.set(historyRef, plain(toHistoryEntry(result.match, saved.updatedAt)));
    return { ok: true as const, saved };
  });
}
