import { describe, expect, it } from 'vitest';
import { addPrompt, deletePrompt, updatePrompt } from './content';

describe('prompt catalog (US-0.2)', () => {
  it('creates, edits and deletes a prompt', () => {
    const created = addPrompt([], 'p1', '  Primera consigna  ');
    if (!created.ok) throw new Error(created.error);
    expect(created.prompts).toEqual([{ id: 'p1', text: 'Primera consigna' }]);

    const renamed = updatePrompt(created.prompts, 'p1', 'Otra consigna');
    if (!renamed.ok) throw new Error(renamed.error);
    expect(renamed.prompts[0]?.text).toBe('Otra consigna');

    const removed = deletePrompt(renamed.prompts, 'p1');
    if (!removed.ok) throw new Error(removed.error);
    expect(removed.prompts).toEqual([]);
  });

  it('rejects a blank prompt and an unknown id', () => {
    expect(addPrompt([], 'p1', '   ')).toEqual({ ok: false, error: 'invalid_prompt' });
    expect(updatePrompt([], 'missing', 'Texto')).toEqual({ ok: false, error: 'unknown_prompt' });
    expect(deletePrompt([], 'missing')).toEqual({ ok: false, error: 'unknown_prompt' });
  });
});
