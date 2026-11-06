import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RosterPlayer } from './ActivePlayersList';
import { ActivePlayersList } from './ActivePlayersList';
import { FiredPlayersList } from './FiredPlayersList';
import { VoteRevealBoard } from './NomineeBoard';
import { awardDeltas, spendDeltas } from './rosterDeltas';

type Scenario = 'roster' | 'deltas' | 'vote';

const BASE_ROSTER: RosterPlayer[] = [
  { email: 'ana@x', name: 'Ana', status: 'active', rank: 1, tokens: 8 },
  { email: 'ben@x', name: 'Ben', status: 'active', rank: 2, tokens: 6 },
  { email: 'carla@x', name: 'Carla', status: 'active', rank: 3, tokens: 5 },
  { email: 'diego@x', name: 'Diego', status: 'active', rank: 4, tokens: 4 },
  { email: 'eva@x', name: 'Eva', status: 'active', rank: 5, tokens: 3 },
  { email: 'fran@x', name: 'Fran', status: 'fired', rank: null, tokens: 7 },
  { email: 'gina@x', name: 'Gina', status: 'fired', rank: null, tokens: 2 },
];

const NOMINEES = ['carla@x', 'ben@x', 'eva@x'] as const;

const BID_SPENDS = [
  { email: 'carla@x', spent: 2 },
  { email: 'ben@x', spent: 1 },
  { email: 'eva@x', spent: 3 },
] as const;

const VOTE_RESULTS = {
  totals: [
    { nominee: 'ben@x', tokens: 9, bonus: 0, total: 9 },
    { nominee: 'carla@x', tokens: 6, bonus: 0, total: 6 },
    { nominee: 'eva@x', tokens: 2, bonus: 0, total: 2 },
  ],
  survivors: ['ben@x', 'carla@x'],
  fired: ['eva@x'],
};

const SPEND_DELTAS = spendDeltas(
  [
    { email: 'ana@x', spent: 2 },
    { email: 'diego@x', spent: 1 },
    { email: 'fran@x', spent: 3 },
  ],
  '-',
);

const AWARD_DELTAS = awardDeltas([
  { email: 'ben@x', amount: 3, reason: 'survivor_reward', survivor: 'ben@x' },
  { email: 'carla@x', amount: 3, reason: 'survivor_reward', survivor: 'carla@x' },
  { email: 'ana@x', amount: 2, reason: 'vote_refund', survivor: 'ben@x' },
]);

function cloneRoster(source: readonly RosterPlayer[]): RosterPlayer[] {
  return source.map((player) => ({ ...player }));
}

/** Swap ranks 2 and 4 among actives (Ben ↔ Diego) for a clear FLIP. */
function reorderedRoster(source: readonly RosterPlayer[]): RosterPlayer[] {
  return cloneRoster(source).map((player) => {
    if (player.email === 'ben@x') return { ...player, rank: 4 };
    if (player.email === 'diego@x') return { ...player, rank: 2 };
    return player;
  });
}

/** Fire Eva into the fired list and compact active ranks. */
function afterFireRoster(source: readonly RosterPlayer[]): RosterPlayer[] {
  const next = cloneRoster(source).map((player) => {
    if (player.email === 'eva@x') return { ...player, status: 'fired' as const, rank: null };
    return player;
  });
  let rank = 1;
  return next.map((player) => {
    if (player.status !== 'active') return player;
    return { ...player, rank: rank++ };
  });
}

export function AnimLab() {
  const [scenario, setScenario] = useState<Scenario>('roster');
  const [runId, setRunId] = useState(0);
  const [phase, setPhase] = useState(0);

  const resetAndPlay = useCallback(() => {
    setPhase(0);
    setRunId((n) => n + 1);
  }, []);

  const pickScenario = useCallback((next: Scenario) => {
    setScenario(next);
    setPhase(0);
    setRunId((n) => n + 1);
  }, []);

  useEffect(() => {
    if (scenario === 'vote') return;
    const timers: number[] = [];
    if (scenario === 'roster') {
      timers.push(window.setTimeout(() => setPhase(1), 400));
      timers.push(window.setTimeout(() => setPhase(2), 1200));
    } else {
      timers.push(window.setTimeout(() => setPhase(1), 400));
      timers.push(window.setTimeout(() => setPhase(2), 1400));
    }
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [scenario, runId]);

  const rosterPlayers = useMemo(() => {
    if (scenario !== 'roster') return cloneRoster(BASE_ROSTER);
    if (phase >= 2) return afterFireRoster(BASE_ROSTER);
    if (phase >= 1) return reorderedRoster(BASE_ROSTER);
    return cloneRoster(BASE_ROSTER);
  }, [scenario, phase, runId]);

  const deltaByEmail = useMemo(() => {
    if (scenario !== 'deltas') return undefined;
    if (phase >= 2) return AWARD_DELTAS;
    if (phase >= 1) return SPEND_DELTAS;
    return {};
  }, [scenario, phase, runId]);

  const votePlayers = useMemo(
    () =>
      BASE_ROSTER.filter((player) => (NOMINEES as readonly string[]).includes(player.email)).map((player) => ({
        email: player.email,
        name: player.name,
        rank: player.rank,
        tokens: player.tokens,
      })),
    [],
  );

  return (
    <div className="anim-lab">
      <h1>Animation lab</h1>
      <p className="lead">Vite only — no API. Change timings in hooks/CSS, then Replay.</p>
      <div className="actions">
        <button type="button" className={scenario === 'roster' ? 'btn' : 'btn secondary'} onClick={() => pickScenario('roster')}>
          Roster FLIP
        </button>
        <button type="button" className={scenario === 'deltas' ? 'btn' : 'btn secondary'} onClick={() => pickScenario('deltas')}>
          Deltas
        </button>
        <button type="button" className={scenario === 'vote' ? 'btn' : 'btn secondary'} onClick={() => pickScenario('vote')}>
          Vote reveal
        </button>
        <button type="button" className="btn secondary" onClick={resetAndPlay}>
          Replay
        </button>
      </div>
      <p className="note block">
        {scenario === 'roster' && 'Reorder ranks, then fire Eva into despedidos.'}
        {scenario === 'deltas' && 'Show spend deltas (−), then award deltas (+).'}
        {scenario === 'vote' && 'Speaking order → vote order FLIP → survivor/fired paint.'}
      </p>
      {scenario === 'vote' ? (
        <div className="anim-lab-stage">
          <VoteRevealBoard
            key={runId}
            nominees={[...NOMINEES]}
            players={votePlayers}
            bidSpends={[...BID_SPENDS]}
            results={VOTE_RESULTS}
            meEmail="ben@x"
          />
        </div>
      ) : (
        <div className="anim-lab-stage anim-lab-rosters">
          <section>
            <h2 className="section">Activos</h2>
            <ActivePlayersList
              players={rosterPlayers}
              highlightEmail="ana@x"
              deltaByEmail={deltaByEmail}
              highlightEmails={scenario === 'roster' && phase >= 2 ? undefined : ['carla@x', 'ben@x', 'eva@x']}
            />
          </section>
          <section>
            <h2 className="section">Despedidos</h2>
            <FiredPlayersList players={rosterPlayers} highlightEmail="ana@x" deltaByEmail={deltaByEmail} />
          </section>
        </div>
      )}
    </div>
  );
}
