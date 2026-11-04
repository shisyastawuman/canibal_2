import { describe, expect, it } from 'vitest';
import { createMatch, findPlayer, joinMatch, revealFirstPrompt } from './match';
import type { Match, Prompt, Rng } from './types';
import { viewForPlayer } from './view';

const prompts: Prompt[] = Array.from({ length: 7 }, (_, i) => ({ id: `p${i + 1}`, text: `Consigna ${i + 1}` }));

function seededRng(seed = 1): Rng {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function unwrap(result: ReturnType<typeof joinMatch>): Match {
  if (!result.ok) throw new Error(result.error);
  return result.match;
}

function withPlayers(count: number, promptOrder = prompts, rng = seededRng()): Match {
  let match = createMatch(promptOrder, rng);
  for (let i = 0; i < count; i++) {
    match = unwrap(joinMatch(match, `Jugador ${i + 1}`, `player${i + 1}@example.com`, rng));
  }
  return match;
}

describe('createMatch (US-0.4)', () => {
  it('returns a match in lobby with a shareable code and a facilitator id', () => {
    const match = createMatch(prompts, seededRng());
    expect(match.phase).toBe('lobby');
    expect(match.round).toBe(0);
    expect(match.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(match.facilitatorId).toHaveLength(20);
    expect(match.promptOrder).toEqual(prompts);
  });
});

describe('joinMatch (US-1.1, US-1.2)', () => {
  it('registers a player with a name, email, 5 tokens and a rank', () => {
    const match = withPlayers(1);
    expect(match.players[0]).toEqual({
      name: 'Jugador 1',
      email: 'player1@example.com',
      status: 'active',
      rank: 1,
      tokens: 5,
      freeTokens: 0,
      immunityBid: 0,
      votes: [],
      firedInRound: null,
      rankWhenFired: null,
    });
  });

  it('keeps ranks unique and contiguous as players join', () => {
    const match = withPlayers(30);
    const ranks = match.players.map((p) => p.rank).sort((a, b) => a! - b!);
    expect(ranks).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('inserts at the rank chosen by the rng and pushes others down', () => {
    let match = createMatch(prompts, seededRng());
    match = unwrap(joinMatch(match, 'A', 'a@x.com', () => 0));
    match = unwrap(joinMatch(match, 'B', 'b@x.com', () => 0));
    expect(findPlayer(match, 'b@x.com')?.rank).toBe(1);
    expect(findPlayer(match, 'a@x.com')?.rank).toBe(2);
  });

  it('rejects a blank name or email', () => {
    const match = createMatch(prompts, seededRng());
    expect(joinMatch(match, '  ', 'a@x.com', seededRng())).toEqual({ ok: false, error: 'invalid_registration' });
    expect(joinMatch(match, 'A', ' ', seededRng())).toEqual({ ok: false, error: 'invalid_registration' });
  });

  it('treats the same email as the same player (second phone or reopened app)', () => {
    const match = withPlayers(3);
    const again = joinMatch(match, 'Otro nombre', '  PLAYER2@Example.com ', seededRng());
    expect(again).toEqual({ ok: true, match });
  });
});

describe('revealFirstPrompt (US-1.3)', () => {
  it('cannot start with fewer than two players, nor with fewer than seven', () => {
    for (const count of [0, 1, 2, 6]) {
      const match = withPlayers(count);
      expect(revealFirstPrompt(match, match.facilitatorId)).toEqual({ ok: false, error: 'roster_size' });
    }
  });

  it('refuses more than 60 players', () => {
    const match = withPlayers(61);
    expect(revealFirstPrompt(match, match.facilitatorId)).toEqual({ ok: false, error: 'roster_size' });
  });

  it('refuses when there are fewer prompts than rounds', () => {
    const match = withPlayers(9, prompts.slice(0, 6));
    expect(revealFirstPrompt(match, match.facilitatorId)).toEqual({ ok: false, error: 'not_enough_prompts' });
  });

  it('only the facilitator can reveal', () => {
    const match = withPlayers(7);
    expect(revealFirstPrompt(match, 'someone-else')).toEqual({ ok: false, error: 'not_facilitator' });
  });

  it('reveals round 1 prompt, fixes P and locks the roster', () => {
    const match = withPlayers(7);
    const result = revealFirstPrompt(match, match.facilitatorId);
    if (!result.ok) throw new Error(result.error);
    expect(result.match.phase).toBe('reveal_prompt');
    expect(result.match.round).toBe(1);
    expect(result.match.prompt).toEqual(prompts[0]);
    expect(result.match.rosterSize).toBe(7);

    expect(joinMatch(result.match, 'Tarde', 'late@x.com', seededRng())).toEqual({ ok: false, error: 'roster_locked' });
    expect(joinMatch(result.match, 'Jugador 1', 'player1@example.com', seededRng())).toEqual({
      ok: true,
      match: result.match,
    });
  });
});

describe('refresh recovery', () => {
  it('a match survives a JSON round trip and play continues', () => {
    const match = withPlayers(7);
    const restored: Match = JSON.parse(JSON.stringify(match));
    expect(restored).toEqual(match);
    expect(revealFirstPrompt(restored, match.facilitatorId).ok).toBe(true);
  });

  it('the facilitator rejoins with the id; players never receive it', () => {
    const match = withPlayers(7);
    const view = viewForPlayer(match, 'player1@example.com');
    expect(view).not.toHaveProperty('facilitatorId');
    expect(JSON.stringify(view)).not.toContain(match.facilitatorId);
    expect(view.me?.email).toBe('player1@example.com');
  });
});
