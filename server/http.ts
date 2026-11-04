import type { IncomingMessage, ServerResponse } from 'node:http';
import { rewards, rulesFromUnknown } from '../src/game';
import type { BonusAllocation, Rules, VoteAllocation } from '../src/game';
import type { Command } from './apply';
import { redact, type Audience } from './redact';
import type { SavedMatch, Store } from './store';

const MAX_BODY = 100_000;

export function createApi(store: Store): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    void handle(store, req, res).catch((error) => {
      console.error(error);
      if (!res.headersSent) send(req, res, 500, { ok: false, error: 'server' });
    });
  };
}

async function handle(store: Store, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (applyCors(req, res)) return;
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  const method = req.method ?? 'GET';

  if (method === 'GET' && path === '/api/health') {
    send(req, res, 200, { ok: true, store: store.kind });
    return;
  }
  if (method === 'GET' && path === '/api/session') {
    send(req, res, 200, { ok: true, ...(await store.snapshot()) });
    return;
  }
  if (method === 'POST' && path === '/api/prompts') {
    const body = await readJson(req);
    const text = field(body, 'text');
    if (text === null) return send(req, res, 400, { ok: false, error: 'invalid_prompt' });
    send(req, res, 200, await store.addPrompt(text));
    return;
  }
  const prompt = path.match(/^\/api\/prompts\/([^/]+)$/);
  if (prompt?.[1] && method === 'PATCH') {
    const body = await readJson(req);
    const text = field(body, 'text');
    if (text === null) return send(req, res, 400, { ok: false, error: 'invalid_prompt' });
    const result = await store.editPrompt(decodeURIComponent(prompt[1]), text);
    send(req, res, result.ok ? 200 : 400, result);
    return;
  }
  if (prompt?.[1] && method === 'DELETE') {
    const result = await store.removePrompt(decodeURIComponent(prompt[1]));
    send(req, res, result.ok ? 200 : 400, result);
    return;
  }
  if (method === 'POST' && path === '/api/matches') {
    const body = await readJson(req);
    const promptIds = stringList(body, 'promptIds');
    if (!promptIds) return send(req, res, 400, { ok: false, error: 'not_enough_prompts' });
    const rules = rulesForCreate(body);
    if (!rules) return send(req, res, 400, { ok: false, error: 'invalid_rules' });
    const result = await store.createMatch(promptIds, Math.random, rules);
    if (!result.ok) return send(req, res, 400, result);
    send(req, res, 200, { ok: true, code: result.saved.match.code, ...payload(result.saved, { role: 'facilitator' }) });
    return;
  }

  const matchRoute = path.match(/^\/api\/matches\/([^/]+)(\/commands)?$/);
  if (!matchRoute?.[1]) {
    send(req, res, 404, { ok: false, error: 'unknown_match' });
    return;
  }
  const code = decodeURIComponent(matchRoute[1]);
  if (method === 'GET' && !matchRoute[2]) {
    await sendMatch(store, req, res, code, null);
    return;
  }
  if (method === 'POST' && matchRoute[2] === '/commands') {
    const command = parseCommand(await readJson(req));
    if (!command) return send(req, res, 400, { ok: false, error: 'invalid_vote' });
    await sendMatch(store, req, res, code, command);
    return;
  }
  send(req, res, 404, { ok: false, error: 'unknown_match' });
}

async function sendMatch(store: Store, req: IncomingMessage, res: ServerResponse, code: string, command: Command | null): Promise<void> {
  const outcome = await store.command(code, command ?? { type: 'tick' }, Math.random);
  if (!outcome.ok && outcome.error === 'unknown_match') {
    send(req, res, 404, { ok: false, error: 'unknown_match' });
    return;
  }
  const saved = outcome.ok ? outcome.saved : outcome.saved;
  if (!saved) {
    send(req, res, outcome.ok ? 500 : 400, outcome.ok ? { ok: false, error: 'server' } : { ok: false, error: outcome.error });
    return;
  }
  const headerId = header(req, 'x-facilitator-id');
  if (headerId && headerId !== saved.match.facilitatorId) {
    send(req, res, 403, { ok: false, error: 'not_facilitator' });
    return;
  }
  const body = payload(saved, audience(req, saved.match, command));
  if (!outcome.ok) {
    send(req, res, 400, { ok: false, error: outcome.error, ...body });
    return;
  }
  send(req, res, 200, { ok: true, ...body });
}

function payload(saved: SavedMatch, audienceKind: Audience): { match: SavedMatch['match']; updatedAt: number } {
  return { match: redact(saved.match, audienceKind), updatedAt: saved.updatedAt };
}

function audience(req: IncomingMessage, match: SavedMatch['match'], command: Command | null): Audience {
  const facilitator = header(req, 'x-facilitator-id');
  if (facilitator && facilitator === match.facilitatorId) return { role: 'facilitator' };
  const email = header(req, 'x-player-email') || (command?.type === 'join' ? command.email : '');
  if (email) return { role: 'player', email };
  return { role: 'public' };
}

function header(req: IncomingMessage, name: string): string {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function parseCommand(body: unknown): Command | null {
  if (!isRecord(body) || typeof body.type !== 'string') return null;
  const facilitatorId = typeof body.facilitatorId === 'string' ? body.facilitatorId : '';
  switch (body.type) {
    case 'tick':
      return { type: 'tick' };
    case 'join':
      if (typeof body.name !== 'string' || typeof body.email !== 'string') return null;
      return { type: 'join', name: body.name, email: body.email };
    case 'setBid':
      if (typeof body.email !== 'string' || typeof body.amount !== 'number') return null;
      return { type: 'setBid', email: body.email, amount: body.amount };
    case 'setVote':
      if (typeof body.email !== 'string' || !Array.isArray(body.allocation)) return null;
      return { type: 'setVote', email: body.email, allocation: body.allocation as VoteAllocation[] };
    case 'assignBonus':
      if (!facilitatorId || !Array.isArray(body.allocation)) return null;
      return { type: 'assignBonus', facilitatorId, allocation: body.allocation as BonusAllocation[] };
    case 'reveal':
    case 'startBid':
    case 'extendBid':
    case 'closeBid':
    case 'startPrep':
    case 'extendPrep':
    case 'closePrep':
    case 'startSpeech':
    case 'extendSpeech':
    case 'closeSpeech':
    case 'startVote':
    case 'extendVote':
    case 'closeVote':
    case 'advance':
      if (!facilitatorId) return null;
      return { type: body.type, facilitatorId };
    default:
      return null;
  }
}

function rulesForCreate(body: unknown): Rules | null {
  if (!isRecord(body) || body.rules === undefined) return rewards;
  return rulesFromUnknown(body.rules);
}

function field(body: unknown, key: string): string | null {
  if (!isRecord(body) || typeof body[key] !== 'string') return null;
  return body[key];
}

function stringList(body: unknown, key: string): string[] | null {
  if (!isRecord(body) || !Array.isArray(body[key])) return null;
  if (!body[key].every((item) => typeof item === 'string')) return null;
  return body[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > MAX_BODY) throw new Error('body too large');
    chunks.push(buffer);
  }
  if (size === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const allowed = (process.env.CORS_ORIGIN ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const origin = header(req, 'origin');
  if (allowed.length > 0 && origin && (allowed.includes('*') || allowed.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-facilitator-id, x-player-email');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

function send(req: IncomingMessage, res: ServerResponse, status: number, body: object): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  if (req.method === 'HEAD') res.end();
  else res.end(payload);
}
