import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { rankingOrder, rulesOf, speakingOrder } from '../game';
import type { Match } from '../game';
import { assignBonus, claimFacilitator, facilitator, facilitatorId } from '../session';
import type { ActionResult } from '../session';
import { Header, Link, Missing, PlayerName } from './chrome';
import { actionError, isLastRound, nameOf, phaseName, rankLabel, roundChip, tokenBounds, tokenLabel } from './format';
import { navigate, useAutoClose, useNow, useSession } from './useSession';

export function FacilitatorMatch({ code }: { code: string }) {
  const session = useSession();
  const match = session.matches[code] ?? null;
  const [known, setKnown] = useState(() => facilitatorId(code));
  useAutoClose(match);
  const now = useNow();
  if (session.missing[code]) return <Missing />;
  if (!match) return <p className="panel">{session.offline ? 'Sin conexión. Reintentando…' : 'Cargando…'}</p>;
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
          void claimFacilitator(code, id).then((result) => {
            if (!result.ok) {
              setError(result.error === 'offline' ? 'No hay conexión. Probá de nuevo en un momento.' : 'Ese identificador no corresponde a esta partida.');
              return;
            }
            onClaim(id.trim());
          });
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

export function playerJoinUrl(code: string): string {
  return `${window.location.origin}/j/${code}`;
}

function Console({ match, facilitatorId: id, now }: { match: Match; facilitatorId: string; now: number }) {
  const [error, setError] = useState('');
  const origin = window.location.origin;
  const joinUrl = playerJoinUrl(match.code);
  const order = speakingOrder(match);
  const speaker = match.speakerIndex === null ? null : order[match.speakerIndex];
  const activeLeft = match.players.filter((player) => player.status === 'active').length;

  function run(pending: Promise<ActionResult>) {
    void pending.then((result) => setError(result.ok ? '' : actionError(result.error)));
  }

  return (
    <>
      <div className="secondary-bar">
        <Link to="/" className="home" label="Inicio">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
              d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"
            />
          </svg>
        </Link>
      </div>
      <Header chip={roundChip(match.phase, match.round, match.rosterSize, rulesOf(match))} />
      <p className="note block">Facilitador · {match.code}</p>
      <label className="field" htmlFor="join">
        Link de jugadores
      </label>
      <input id="join" type="text" readOnly value={joinUrl} />
      <div className="qr">
        <QRCodeSVG value={joinUrl} size={196} marginSize={4} bgColor="#ffffff" fgColor="#222222" title="Código QR del link de jugadores" />
      </div>
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
          <LobbyPlayers match={match} />
          <p className="panel">Revelar la consigna traba el ingreso. Hacen falta entre 3 y 60 jugadores.</p>
        </>
      )}
      {match.phase === 'speeches' && speaker && <Speaker match={match} speaker={speaker} />}
      {match.phase === 'facilitator_bonus' && <Bonus match={match} facilitator={id} onError={setError} />}
      {match.phase === 'victory' && match.winners && (
        <>
          <h2>Ganadores</h2>
          <Winners match={match} />
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
        {match.phase === 'reveal_vote' && (
          <button type="button" className="btn" onClick={() => run(facilitator.assignRewards(match.code, id))}>
            Asignar recompensas
          </button>
        )}
        {match.phase === 'round_end' && (
          <button type="button" className="btn" onClick={() => run(facilitator.advance(match.code, id))}>
            {activeLeft <= rulesOf(match).activePlayersWhoWin || isLastRound(match.rosterSize, match.round, rulesOf(match)) ? 'Ver ganadores' : 'Siguiente ronda'}
          </button>
        )}
        <button type="button" className="btn secondary" onClick={() => navigate(`/p/${match.code}`)}>
          Abrir vista pública
        </button>
      </div>
      <p className="note section">Fase: {phaseName(match.phase)}</p>
    </>
  );
}

function LobbyPlayers({ match }: { match: Match }) {
  const players = match.players.slice().sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const { least, most } = tokenBounds(players.map((player) => player.tokens));
  return (
    <ul className="people">
      {players.map((player) => (
        <li key={player.email}>
          <PlayerName name={player.name} tokens={player.tokens} least={least} most={most} />
          {` · ${rankLabel(player.rank)} · ${tokenLabel(player.tokens)} · ${player.email}`}
        </li>
      ))}
    </ul>
  );
}

function Speaker({ match, speaker }: { match: Match; speaker: string }) {
  const order = rankingOrder(match);
  const { least, most } = tokenBounds(order.map((email) => match.players.find((player) => player.email === email)?.tokens ?? 0));
  const player = match.players.find((item) => item.email === speaker);
  return (
    <p className="panel">
      {match.clock ? 'Está hablando' : 'Próximo turno'}:{' '}
      <PlayerName name={nameOf(match.players, speaker)} tokens={player?.tokens ?? 0} least={least} most={most} />
      {` · ${tokenLabel(player?.tokens ?? 0)}`}
    </p>
  );
}

function Winners({ match }: { match: Match }) {
  const rows = (match.winners ?? []).map((winner) => {
    const player = match.players.find((item) => item.email === winner.email);
    return { winner, player, tokens: player?.tokens ?? 0 };
  });
  const { least, most } = tokenBounds(rows.map((row) => row.tokens));
  return (
    <table className="grid">
      <tbody>
        {rows.map(({ winner, player, tokens }) => (
          <tr key={winner.email}>
            <td>
              <PlayerName name={player?.name ?? winner.email} tokens={tokens} least={least} most={most} />
            </td>
            <td>
              {winner.kind === 'active' ? `Activo · ${rankLabel(player?.rank ?? null)} · ${tokenLabel(tokens)}` : `Despedido · ${tokenLabel(tokens)}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
      if (next < 0 || used + delta > rulesOf(match).facilitatorBonusTokens) return current;
      return { ...current, [email]: next };
    });
  }

  function save(skip: boolean) {
    const allocation = skip
      ? []
      : match.nominees.map((email) => ({ nominee: email, tokens: counts[email] ?? 0 }));
    void assignBonus(match.code, id, allocation).then((result) => {
      onError(result.ok ? '' : actionError(result.error));
    });
    if (skip) setCounts(Object.fromEntries(match.nominees.map((email) => [email, 0])));
  }

  const order = rankingOrder(match);
  const { least, most } = tokenBounds(order.map((email) => match.players.find((player) => player.email === email)?.tokens ?? 0));

  return (
    <>
      <h2>Bono público de {tokenLabel(rulesOf(match).facilitatorBonusTokens)}</h2>
      <p className="lead">Repartí hasta {tokenLabel(rulesOf(match).facilitatorBonusTokens)} entre los nominados, o salteá el bono.</p>
      <p className="note block">
        {used} de {rulesOf(match).facilitatorBonusTokens} asignadas
      </p>
      <table className="grid">
        <tbody>
          {order.map((email) => {
            const player = match.players.find((item) => item.email === email);
            return (
            <tr key={email}>
              <td>
                <PlayerName name={player?.name ?? email} tokens={player?.tokens ?? 0} least={least} most={most} />
                {` ${rankLabel(player?.rank ?? null)} · ${tokenLabel(player?.tokens ?? 0)}`}
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
            );
          })}
        </tbody>
      </table>
      <div className="actions">
        <button type="button" className="btn" onClick={() => save(false)}>
          Asignar bono
        </button>
      </div>
    </>
  );
}
