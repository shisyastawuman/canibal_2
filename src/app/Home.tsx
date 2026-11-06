import { useEffect, useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, rewards, roundCount, rulesFromUnknown } from '../game';
import type { Rules } from '../game';
import { createNewMatch } from '../session';
import { Link } from './chrome';
import { actionError } from './format';
import { navigate, useSession } from './useSession';

export function Home() {
  const session = useSession();
  const open = session.openMatches;
  if (!session.ready) return <p className="panel">Cargando…</p>;
  return (
    <>
      <h1>Caníbal</h1>
      <p className="subtitle">¿Tenés lo que hace falta para sobrevivir?</p>
      <div className="actions">
        <Link to="/nueva" className="btn">
          Crear partida
        </Link>
        <Link to="/consignas" className="btn secondary">
          Consignas
        </Link>
        <Link to="/historial" className="btn secondary">
          Historial
        </Link>
      </div>
      {open.length > 0 && (
        <>
          <h2 className="section">Partidas en curso</h2>
          <ul className="people">
            {open.map((match) => (
              <li key={match.code}>
                <Link to={`/m/${match.code}`}>{match.code}</Link>
                {` · ${match.playerCount} jugadores`}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function freshRules(): Rules {
  const seats = rewards.firedWinnerBands[0]?.seats ?? 1;
  return { ...rewards, firedWinnerBands: [{ rosterUpTo: MAX_PLAYERS, seats }] };
}

function whole(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function NewMatch() {
  const session = useSession();
  const [order, setOrder] = useState<string[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rules, setRules] = useState<Rules>(freshRules);
  const [previewPlayers, setPreviewPlayers] = useState(String(MIN_PLAYERS));
  const [error, setError] = useState('');
  const promptKey = session.prompts.map((prompt) => prompt.id).join('|');
  const players = whole(previewPlayers);
  const nomineesMax = players !== null && players > 2 ? players - 1 : 2;
  const survivorsMax = Math.max(1, rules.nomineesPerRound - 1);
  const firedPerRound = Math.max(0, rules.nomineesPerRound - rules.rewardedSurvivors);
  const firedWinners = rules.firedWinnerBands[0]?.seats ?? 0;
  const rounds =
    players !== null && players >= MIN_PLAYERS && players <= MAX_PLAYERS && rules.nomineesPerRound > rules.rewardedSurvivors && rules.activePlayersWhoWin < players
      ? roundCount(players, rules)
      : 0;
  const rulesOk = rulesFromUnknown(rules) !== null;

  useEffect(() => {
    if (!promptKey) return;
    setOrder((current) => (current.length > 0 ? current : promptKey.split('|')));
    setPicked((current) => (current.size > 0 ? current : new Set(promptKey.split('|'))));
  }, [promptKey]);

  useEffect(() => {
    setRules((current) => {
      const nominees = clamp(current.nomineesPerRound, 2, nomineesMax);
      const survivors = clamp(current.rewardedSurvivors, 1, Math.max(1, nominees - 1));
      if (nominees === current.nomineesPerRound && survivors === current.rewardedSurvivors) return current;
      return { ...current, nomineesPerRound: nominees, rewardedSurvivors: survivors };
    });
  }, [nomineesMax]);

  function move(id: string, delta: number) {
    setOrder((current) => {
      const index = current.indexOf(id);
      const next = index + delta;
      const swap = current[next];
      if (index < 0 || swap === undefined) return current;
      const copy = [...current];
      copy[next] = id;
      copy[index] = swap;
      return copy;
    });
  }

  function setCount(key: keyof Omit<Rules, 'firedWinnerBands'>, raw: string) {
    const count = whole(raw);
    if (count === null) return;
    setRules((current) => {
      if (key === 'nomineesPerRound') {
        const nominees = clamp(count, 2, nomineesMax);
        const survivors = clamp(current.rewardedSurvivors, 1, Math.max(1, nominees - 1));
        return { ...current, nomineesPerRound: nominees, rewardedSurvivors: survivors };
      }
      if (key === 'rewardedSurvivors') {
        return { ...current, rewardedSurvivors: clamp(count, 1, survivorsMax) };
      }
      return { ...current, [key]: count };
    });
  }

  function setFiredWinners(raw: string) {
    const seats = whole(raw);
    if (seats === null) return;
    setRules((current) => ({
      ...current,
      firedWinnerBands: [{ rosterUpTo: MAX_PLAYERS, seats }],
    }));
  }

  function setPreview(raw: string) {
    const count = whole(raw);
    if (count === null) {
      setPreviewPlayers(raw);
      return;
    }
    setPreviewPlayers(String(clamp(count, MIN_PLAYERS, MAX_PLAYERS)));
  }

  async function create() {
    const parsed = rulesFromUnknown(rules);
    if (!parsed) {
      setError(actionError('invalid_rules'));
      return;
    }
    const result = await createNewMatch(
      order.filter((id) => picked.has(id)),
      parsed,
    );
    if (!result.ok) {
      setError(actionError(result.error));
      return;
    }
    navigate(`/m/${result.code}`);
  }

  if (!session.ready) return <p className="panel">Cargando…</p>;

  return (
    <>
      <h1>Nueva partida</h1>
      <h2 className="section">Reglas de esta partida</h2>
      <p className="lead">Partís de los valores por defecto. Lo que cambies vale solo para esta partida.</p>
      <div className="rules">
        <RuleField label="Jugadores previstos" value={previewPlayers} min={MIN_PLAYERS} max={MAX_PLAYERS} onChange={setPreview} />
        <RuleField
          label="Nominados por ronda"
          value={rules.nomineesPerRound}
          min={2}
          max={nomineesMax}
          onChange={(value) => setCount('nomineesPerRound', value)}
        />
        <RuleField
          label="Sobrevivientes por ronda"
          value={rules.rewardedSurvivors}
          min={1}
          max={survivorsMax}
          onChange={(value) => setCount('rewardedSurvivors', value)}
        />
        <RuleField label="Despedidos por ronda" value={firedPerRound} readOnly />
        <RuleField label="Activos que ganan" value={rules.activePlayersWhoWin} onChange={(value) => setCount('activePlayersWhoWin', value)} />
        <RuleField label="Ganadores despedidos" value={firedWinners} min={0} onChange={setFiredWinners} />
        <RuleField label="Rondas" value={rounds > 0 ? String(rounds) : '—'} readOnly />
        <RuleField label="Fichas al empezar" value={rules.startingInfluenceTokens} onChange={(value) => setCount('startingInfluenceTokens', value)} />
        <RuleField label="Fichas gratis por ronda para activos" value={rules.freeTokensForActiveVoters} onChange={(value) => setCount('freeTokensForActiveVoters', value)} />
        <RuleField label="Fichas gratis por ronda para despedidos" value={rules.freeTokensForFiredVoters} onChange={(value) => setCount('freeTokensForFiredVoters', value)} />
        <RuleField label="Bono del facilitador" value={rules.facilitatorBonusTokens} onChange={(value) => setCount('facilitatorBonusTokens', value)} />
        <RuleField label="Puestos que sube un sobreviviente" value={rules.survivorRankPlaces} onChange={(value) => setCount('survivorRankPlaces', value)} />
        <RuleField label="Fichas premio por sobrevivir" value={rules.survivorInfluenceTokens} onChange={(value) => setCount('survivorInfluenceTokens', value)} />
        <RuleField label="Fichas premio por votar a un sobreviviente" value={rules.extraTokensForVotingASurvivor} onChange={(value) => setCount('extraTokensForVotingASurvivor', value)} />
        <RuleField label="Fichas premio por ser mayor votante de un sobreviviente" value={rules.extraTokensForTopVoter} onChange={(value) => setCount('extraTokensForTopVoter', value)} />
      </div>
      <p className="note block">
        {rounds > 0
          ? `Con ${players} jugadores se despide a ${firedPerRound} por ronda hasta dejar ${rules.activePlayersWhoWin} activos: ${rounds} ${rounds === 1 ? 'ronda' : 'rondas'}. La última ronda ajusta sobrevivientes y despedidos para dejar exactamente a esos ganadores. Las rondas reales usan los jugadores que entren.`
          : `Las rondas se calculan con más nominados que sobrevivientes, y con menos ganadores activos que jugadores (entre ${MIN_PLAYERS} y ${MAX_PLAYERS}).`}
      </p>
      <h2 className="section">Consignas</h2>
      <p className="lead">
        El orden de esta lista es el de las rondas.
        {rounds > 0 ? ` Con ${players} jugadores hacen falta al menos ${rounds} consignas.` : ''}
      </p>
      {order.map((id) => {
        const prompt = session.prompts.find((item) => item.id === id);
        if (!prompt) return null;
        return (
          <div key={id} className="prompt-row">
            <label className="check">
              <input
                type="checkbox"
                checked={picked.has(id)}
                onChange={() => {
                  setPicked((current) => {
                    const next = new Set(current);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
              />
              <span>
                {prompt.type && <span className={`tag ${tagClass(prompt.type)}`}>{prompt.type}</span>}
                {prompt.text}
              </span>
            </label>
            <div className="row-actions">
              <button type="button" className="btn secondary" onClick={() => move(id, -1)}>
                Subir
              </button>
              <button type="button" className="btn secondary" onClick={() => move(id, 1)}>
                Bajar
              </button>
            </div>
          </div>
        );
      })}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={create} disabled={picked.size === 0 || !rulesOk}>
          Crear partida
        </button>
        <Link to="/" className="btn secondary">
          Volver
        </Link>
      </div>
    </>
  );
}

function tagClass(type: string): string {
  const letter = type.trim().charAt(0).toUpperCase();
  if (letter === 'B') return 'tag-b';
  if (letter === 'C') return 'tag-c';
  return 'tag-a';
}

function RuleField({
  label,
  value,
  onChange,
  readOnly = false,
  min = 0,
  max,
}: {
  label: string;
  value: number | string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <label className="rule">
      <span>{label}</span>
      <input
        type={readOnly ? 'text' : 'number'}
        min={min}
        max={max}
        readOnly={readOnly}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
    </label>
  );
}
