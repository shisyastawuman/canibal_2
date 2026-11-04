import { nomineeCount, rewards } from '../src/game';

export interface StressReport {
  ok: boolean;
  players: number;
  joinMs: number;
  bidBurstMs: number;
  voteBurstMs: number;
  votesLanded: number;
  expectedVotes: number;
  rejoinOk: boolean;
  facilitatorRejoinOk: boolean;
  secretsHidden: boolean;
  doubleClose: boolean;
  errors: string[];
}

interface MatchBody {
  ok: boolean;
  error?: string;
  code?: string;
  match?: {
    code: string;
    facilitatorId: string;
    phase: string;
    nominees: string[];
    players: { email: string; votes: { tokens: number }[]; immunityBid: number }[];
    results: { totals: { tokens: number }[] } | null;
    clock: { deadline: number } | null;
    bidSpends: { spent: number }[] | null;
  };
  updatedAt?: number;
}

/** Fifty players join, bid, and vote at once against a running server. Every write has to land. */
export async function runStress(baseUrl: string, players = 50): Promise<StressReport> {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(message);
  const session = await get<{ prompts: { id: string }[] }>(`${baseUrl}/api/session`);
  const rules = { ...rewards, nomineesPerRound: 9 };
  const created = await post<MatchBody>(`${baseUrl}/api/matches`, { promptIds: session.prompts.map((prompt) => prompt.id), rules });
  if (!created.ok || !created.code || !created.match) {
    return report(players, 0, 0, 0, 0, 0, false, false, false, false, ['could not create the match']);
  }
  const code = created.code;
  const facilitatorId = created.match.facilitatorId;
  const emails = Array.from({ length: players }, (_, index) => `p${index + 1}@stress.test`);

  const joinStarted = performance.now();
  const joins = await Promise.all(emails.map((email, index) => command(baseUrl, code, { type: 'join', name: `Jugador ${index + 1}`, email }, { email })));
  const joinMs = performance.now() - joinStarted;
  if (joins.some((result) => !result.ok)) fail(`${joins.filter((result) => !result.ok).length} joins failed`);

  const revealed = await command(baseUrl, code, { type: 'reveal', facilitatorId }, { facilitatorId });
  if (!revealed.ok) fail(`reveal failed: ${revealed.error ?? ''}`);
  const bidding = await command(baseUrl, code, { type: 'startBid', facilitatorId }, { facilitatorId });
  if (!bidding.ok) fail(`startBid failed: ${bidding.error ?? ''}`);

  const bidStarted = performance.now();
  const bids = await Promise.all([
    ...emails.map((email) => command(baseUrl, code, { type: 'setBid', email, amount: 1 }, { email })),
    ...emails.map((email) => getMatch(baseUrl, code, { email })),
  ]);
  const bidBurstMs = performance.now() - bidStarted;
  const bidWrites = bids.slice(0, players);
  if (bidWrites.some((result) => !result.ok)) fail(`${bidWrites.filter((result) => !result.ok).length} bids failed`);

  const closedBid = await command(baseUrl, code, { type: 'closeBid', facilitatorId }, { facilitatorId });
  if (!closedBid.ok) fail(`closeBid failed: ${closedBid.error ?? ''}`);
  if ((closedBid.match?.players.length ?? 0) !== players) fail(`roster is ${closedBid.match?.players.length ?? 0}, expected ${players}`);
  const bidSpends = closedBid.match?.bidSpends;
  if (!bidSpends || bidSpends.length !== players || bidSpends.some((bid) => bid.spent !== 1)) {
    fail('a concurrent bid was lost');
  }

  if (!(await advanceToVote(baseUrl, code, facilitatorId, fail))) {
    return report(players, joinMs, bidBurstMs, 0, 0, 0, false, false, false, false, errors);
  }

  const voting = await getMatch(baseUrl, code, { facilitatorId });
  const nominees = voting.match?.nominees ?? [];
  const voters = (voting.match?.players ?? []).map((player) => player.email).filter((email) => !nominees.includes(email));
  const expectedVotes = voters.length;
  if (nominees.length !== nomineeCount(players, 1, rules)) fail(`expected ${nomineeCount(players, 1, rules)} nominees, saw ${nominees.length}`);

  const voteStarted = performance.now();
  const voteResults = await Promise.all([
    ...voters.map((email, index) =>
      command(
        baseUrl,
        code,
        { type: 'setVote', email, allocation: [{ nominee: nominees[index % nominees.length] ?? email, tokens: 1 }] },
        { email },
      ),
    ),
    ...voters.map((email) => getMatch(baseUrl, code, { email })),
  ]);
  const voteBurstMs = performance.now() - voteStarted;
  const voteWrites = voteResults.slice(0, voters.length);
  if (voteWrites.some((result) => !result.ok)) fail(`${voteWrites.filter((result) => !result.ok).length} votes failed`);

  const sample = voters[0];
  const mine = sample ? await getMatch(baseUrl, code, { email: sample }) : null;
  const pub = await getMatch(baseUrl, code, {});
  const otherVotes = (mine?.match?.players ?? []).filter((player) => player.email !== sample).some((player) => player.votes.length > 0);
  const ownVote = (mine?.match?.players ?? []).find((player) => player.email === sample)?.votes.length === 1;
  const publicHidden = (pub.match?.players.length ?? 1) === 0 && !JSON.stringify(pub).includes(facilitatorId);
  const secretsHidden = Boolean(sample) && ownVote && !otherVotes && publicHidden && mine?.match?.facilitatorId === '';
  if (!secretsHidden) fail('a phone could see another player’s vote or the facilitator id');

  const closed = await command(baseUrl, code, { type: 'closeVote', facilitatorId }, { facilitatorId });
  if (!closed.ok) fail(`closeVote failed: ${closed.error ?? ''}`);
  const votesLanded = (closed.match?.results?.totals ?? []).reduce((sum, total) => sum + total.tokens, 0);
  if (votesLanded !== expectedVotes) fail(`${votesLanded} votes landed, expected ${expectedVotes}`);

  const again = await command(baseUrl, code, { type: 'closeVote', facilitatorId }, { facilitatorId });
  const doubleClose = !again.ok && again.error === 'wrong_phase';
  if (!doubleClose) fail('closing the vote twice changed the match');

  const rejoined = sample ? await getMatch(baseUrl, code, { email: sample }) : null;
  const rejoinOk = Boolean(rejoined?.ok && rejoined.match?.players.some((player) => player.email === sample));
  if (!rejoinOk) fail('rejoining with the same email failed');

  const rejected = await getMatch(baseUrl, code, { facilitatorId: 'not-the-facilitator' });
  const accepted = await getMatch(baseUrl, code, { facilitatorId });
  const facilitatorRejoinOk = !rejected.ok && rejected.error === 'not_facilitator' && accepted.ok && accepted.match?.facilitatorId === facilitatorId;
  if (!facilitatorRejoinOk) fail('the facilitator could not re-enter with the saved id');

  return report(players, joinMs, bidBurstMs, voteBurstMs, votesLanded, expectedVotes, rejoinOk, facilitatorRejoinOk, secretsHidden, doubleClose, errors);
}

async function advanceToVote(baseUrl: string, code: string, facilitatorId: string, fail: (message: string) => void): Promise<boolean> {
  const prep = await command(baseUrl, code, { type: 'startPrep', facilitatorId }, { facilitatorId });
  if (!prep.ok) {
    fail(`startPrep failed: ${prep.error ?? ''}`);
    return false;
  }
  const closedPrep = await command(baseUrl, code, { type: 'closePrep', facilitatorId }, { facilitatorId });
  if (!closedPrep.ok) {
    fail(`closePrep failed: ${closedPrep.error ?? ''}`);
    return false;
  }
  for (let guard = 0; guard < 40; guard++) {
    const current = await getMatch(baseUrl, code, { facilitatorId });
    if (current.match?.phase === 'facilitator_bonus') break;
    if (current.match?.phase !== 'speeches') {
      fail(`stuck in ${current.match?.phase ?? 'unknown'} before the vote`);
      return false;
    }
    const next = await command(baseUrl, code, { type: current.match?.clock ? 'closeSpeech' : 'startSpeech', facilitatorId }, { facilitatorId });
    if (!next.ok) {
      fail(`speech step failed: ${next.error ?? ''}`);
      return false;
    }
  }
  const started = await command(baseUrl, code, { type: 'startVote', facilitatorId }, { facilitatorId });
  if (!started.ok) {
    fail(`startVote failed: ${started.error ?? ''}`);
    return false;
  }
  return true;
}

function report(
  players: number,
  joinMs: number,
  bidBurstMs: number,
  voteBurstMs: number,
  votesLanded: number,
  expectedVotes: number,
  rejoinOk: boolean,
  facilitatorRejoinOk: boolean,
  secretsHidden: boolean,
  doubleClose: boolean,
  errors: string[],
): StressReport {
  return {
    ok: errors.length === 0,
    players,
    joinMs: Math.round(joinMs),
    bidBurstMs: Math.round(bidBurstMs),
    voteBurstMs: Math.round(voteBurstMs),
    votesLanded,
    expectedVotes,
    rejoinOk,
    facilitatorRejoinOk,
    secretsHidden,
    doubleClose,
    errors,
  };
}

function command(baseUrl: string, code: string, body: object, auth: { email?: string; facilitatorId?: string }): Promise<MatchBody> {
  return post(`${baseUrl}/api/matches/${code}/commands`, body, auth);
}

function getMatch(baseUrl: string, code: string, auth: { email?: string; facilitatorId?: string }): Promise<MatchBody> {
  return get(`${baseUrl}/api/matches/${code}`, auth);
}

async function get<T>(url: string, auth: { email?: string; facilitatorId?: string } = {}): Promise<T> {
  const response = await fetch(url, { headers: authHeaders(auth), cache: 'no-store' });
  return (await response.json()) as T;
}

async function post<T>(url: string, body: object, auth: { email?: string; facilitatorId?: string } = {}): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(auth) },
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

function authHeaders(auth: { email?: string; facilitatorId?: string }): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth.email) headers['x-player-email'] = auth.email;
  if (auth.facilitatorId) headers['x-facilitator-id'] = auth.facilitatorId;
  return headers;
}

const invoked = process.argv[1]?.replaceAll('\\', '/').endsWith('server/stress.ts');
if (invoked) {
  const baseUrl = process.env.STRESS_URL ?? 'http://127.0.0.1:8080';
  try {
    const report = await runStress(baseUrl, Number(process.env.STRESS_PLAYERS ?? 50));
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exit(1);
  } catch (error) {
    console.error(`Could not reach ${baseUrl}. Start the app with npm start, then run npm run stress.`);
    console.error(error);
    process.exit(1);
  }
}
