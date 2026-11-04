import type { Prompt } from '../src/game';
import catalog from '../prompts.json';

/** Catalog seeded into a new store. `type` is the section each consigna belongs to. */
export const SEED_PROMPTS: Prompt[] = catalog.map((prompt) => ({ ...prompt }));
