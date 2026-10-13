import { useState } from 'react';
import { assignFacilitatorBonus, speakingOrder } from '../game';
import type { Match } from '../game';
import { claimFacilitator, facilitator, facilitatorId, updateMatch } from '../session';
import { Header, Link, Missing } from './chrome';
import { errorText, isLastRound, nameOf, phaseName, rankLabel, roundChip } from './format';
import { navigate, useAutoClose, useNow, useSession } from './useSession';

export function FacilitatorMatch({ code }: { code: string }) {
  const session = useSession();
  const match = session.matches[code] ?? null;
  const [known, setKnown] = useState(() => facilitatorId(code));
  useAutoClose(match);
  const now = useNow();
  if (!match) return <Missing />;
  if (!known || known !== match.facilitatorId) return <Claim code={code} onClaim={setKnown} />;
  return <Console match={match} facilitatorId={known} now={now} />;
}

function Claim({ code, onClaim }: { code: string; onClaim: (id: string) => void }) {
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  return (
    <>
      <h1>Caníbal</h1>
      <p className="lead">Para retomar la partida pegá el identificador de facilitador.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!claimFacilitator(code, id)) {
            setError('Ese identificador no corresponde a esta partida.');
            return;
          }
          onClaim(id.trim());
        }}
      >
        <label className="field" htmlFor="fac">
          Identificador
        </label>
        <input id="fac" type="text" value={id} onChange={(event) => setId(event.target.value)} />
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn">
          Entrar
        </button>
      </form>
    </>
  );
}

function Console({ match, facilitatorId: id, now }: { match: Match; facilitatorId: string; now: number }) {
  const [error, setError] = useState('');
  const origin = window.location.origin;
  const order = speakingOrder(match);
  const speaker = match.speakerIndex === null ? null : order[match.speakerIndex];
  const activeLeft = match.players.filter((player) => player.status === 'active').length;

  function run(result: { ok: true; match: Match } | { ok: false; error: Parameters<typeof errorText>[0] }) {
    setError(result.ok ? '' : errorText(result.error));
  }

  return (
    <>
      <Header chip={roundChip(match.phase, match.round, match.rosterSize)} />
      <p className="note block">Facilitador · {match.code}</p>
      <label className="field" htmlFor="join">
        Link de jugadores
      </label>
      <input id="join" type="text" readOnly value={`${origin}/j/${match.code}`} />
      <label className="field" htmlFor="pub">
        Vista pública
      </label>
      <input id="pub" type="text" readOnly value={`${origin}/p/${match.code}`} />
      <p className="note block">Identificador para volver a entrar: {id}</p>
      {match.prompt && (
        <div className="prompt-soft">
          <p>{match.prompt.text}</p>
        </div>
      )}
      {match.clock && <p className="clock compact">{formatRemaining(match.clock.deadline, now)}</p>}
      {match.phase === 'lobby' && (
        <>
          <p className="block">
            <b>Jugadores conectados ({match.players.length})</b>
          </p>
          <ul className="people">
            {match.players
              .slice()
              .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
              .map((player) => (
                <li key={player.email}>
                  {player.name} · {rankLabel(player.rank)} · {player.email}
                </li>
              ))}
          </ul>
          <p className="panel">Revelar la consigna traba el ingreso. Hacen falta entre 7 y 60 jugadores.</p>
        </>
      )}
      {match.phase === 'speeches' && speaker && (
        <p className="panel">{match.clock ? 'Está hablando' : 'Próximo turno'}: {nameOf(match.players, speaker)}</p>
      )}
      {match.phase === 'facilitator_bonus' && <Bonus match={match} facilitator={id} onError={setError} />}
      {match.phase === 'victory' && match.winners && (
        <>
          <h2>Ganadores</h2>
          <table className="grid">
            <tbody>
              {match.winners.map((winner) => {
                const player = match.players.find((item) => item.email === winner.email);
                return (
                  <tr key={winner.email}>
                    <td>{nameOf(match.players, winner.email)}</td>
                    <td>
                      {winner.kind === 'active'
                        ? `Activo · ${rankLabel(player?.rank ?? null)}`
                        : `Votante estrella · ${player?.tokens ?? 0} fichas`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        {match.phase === 'lobby' && (
          <button type="button" className="btn" onClick={() => run(facilitator.reveal(match.code, id))}>
            Revelar la primera consigna
          </button>
        )}
        {match.phase === 'reveal_prompt' && (
          <button type="button" className="btn" onClick={() => run(facilitator.startBid(match.code, id))}>
            Iniciar puja
          </button>
        )}
        {match.phase === 'immunity_bid' && (
          <>
            <button type="button" className="btn secondary" onClick={() => run(facilitator.extendBid(match.code, id))}>
              Sumar 30 segundos
            </button>
            <button type="button" className="btn" onClick={() => run(facilitator.closeBid(match.code, id))}>
              Cerrar puja
            </button>
          </>
        )}
        {match.phase === 'reveal_bid' && (
          <button type="button" className="btn" onClick={() => run(facilitator.startPrep(match.code, id))}>
            Iniciar preparación
          </button>
        )}
        {match.phase === 'prep' && (
          <>
            <button type="button" className="btn secondary" onClick={() => run(facilitator.extendPrep(match.code, id))}>
              Sumar 30 segundos
            </button>
            <button type="button" className="btn" onClick={() => run(facilitator.closePrep(match.code, id))}>
              Cerrar preparación
            </button>
          </>
        )}
        {match.phase === 'speeches' && !match.clock && (
          <button type="button" className="btn" onClick={() => run(facilitator.startSpeech(match.code, id))}>
            Iniciar turno
          </button>
        )}
        {match.phase === 'speeches' && match.clock && (
          <>
            <button type="button" className="btn secondary" onClick={() => run(facilitator.extendSpeech(match.code, id))}>
              Sumar 30 segundos
            </button>
            <button type="button" className="btn" onClick={() => run(facilitator.closeSpeech(match.code, id))}>
              Cerrar turno
            </button>
          </>
        )}
        {match.phase === 'facilitator_bonus' && (
          <button type="button" className="btn" onClick={() => run(facilitator.startVote(match.code, id))}>
            Iniciar votación
          </button>
        )}
        {match.phase === 'vote' && (
          <>
            <button type="button" className="btn secondary" onClick={() => run(facilitator.extendVote(match.code, id))}>
              Sumar 30 segundos
            </button>
            <button type="button" className="btn" onClick={() => run(facilitator.closeVote(match.code, id))}>
              Cerrar votación
            </button>
          </>
        )}
        {(match.phase === 'reveal_vote' || match.phase === 'round_end') && (
          <button type="button" className="btn" onClick={() => run(facilitator.advance(match.code, id))}>
            {activeLeft <= 2 || isLastRound(match.rosterSize, match.round) ? 'Ver ganadores' : 'Siguiente ronda'}
          </button>
        )}
        <Link to="/" className="btn secondary">
          Inicio
        </Link>
        <button type="button" className="btn secondary" onClick={() => navigate(`/p/${match.code}`)}>
          Abrir vista pública
        </button>
      </div>
      <p className="note section">Fase: {phaseName(match.phase)}</p>
    </>
  );
}

function formatRemaining(deadline: number, now: number): string {
  const total = Math.max(0, Math.ceil((deadline - now) / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

function Bonus({ match, facilitator: id, onError }: { match: Match; facilitator: string; onError: (message: string) => void }) {
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(match.nominees.map((email) => [email, match.facilitatorBonus?.find((item) => item.nominee === email)?.tokens ?? 0])),
  );
  const used = Object.values(counts).reduce((sum, value) => sum + value, 0);

  function set(email: string, delta: number) {
    setCounts((current) => {
      const value = current[email] ?? 0;
      const next = value + delta;
      if (next < 0 || used + delta > 5) return current;
      return { ...current, [email]: next };
    });
  }

  function save(skip: boolean) {
    const allocation = skip
      ? []
      : match.nominees.map((email) => ({ nominee: email, tokens: counts[email] ?? 0 }));
    const result = updateMatch(match.code, (current) => assignFacilitatorBonus(current, id, allocation));
    onError(result.ok ? '' : errorText(result.error));
    if (skip) setCounts(Object.fromEntries(match.nominees.map((email) => [email, 0])));
  }

  return (
    <>
      <h2>Bono público de 5 fichas</h2>
      <p className="lead">Repartí hasta 5 fichas entre los nominados, o salteá el bono.</p>
      <p className="note block">{used} de 5 asignadas</p>
      <table className="grid">
        <tbody>
          {match.nominees.map((email) => (
            <tr key={email}>
              <td>
                {nameOf(match.players, email)} {rankLabel(match.players.find((player) => player.email === email)?.rank ?? null)}
              </td>
              <td className="num">
                <span className="tiny">
                  <button type="button" className="btn-tiny" aria-label={`Menos para ${nameOf(match.players, email)}`} onClick={() => set(email, -1)}>
                    −
                  </button>
                  <b>{counts[email] ?? 0}</b>
                  <button type="button" className="btn-tiny" aria-label={`Más para ${nameOf(match.players, email)}`} onClick={() => set(email, 1)}>
                    +
                  </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions">
        <button type="button" className="btn" onClick={() => save(false)}>
          Asignar bono
        </button>
        <button type="button" className="btn secondary" onClick={() => save(true)}>
          Omitir bono
        </button>
      </div>
    </>
  );
}
