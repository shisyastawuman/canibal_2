import { useState } from 'react';
import { setImmunityBid, setVote, speakingOrder, viewForPlayer } from '../game';
import type { PlayerInMatch, PlayerView, TokenAward } from '../game';
import { registerPlayer, updateMatch } from '../session';
import { ClockRead, Header } from './chrome';
import { errorText, isLastRound, nameOf, rankLabel, roundChip, slots } from './format';
import { useAutoClose, useNow, usePlayer, useSession } from './useSession';
import { Missing } from './chrome';

export function PlayerMatch({ code }: { code: string }) {
  const session = useSession();
  const match = session.matches[code] ?? null;
  const identity = usePlayer(code);
  const [returning, setReturning] = useState(false);
  useAutoClose(match);
  const now = useNow();
  if (!match) return <Missing />;

  const joined = identity !== null && match.players.some((player) => player.email === identity.email);
  if (!joined) {
    if (match.phase !== 'lobby') return <Closed code={code} returning={returning} onReturn={() => setReturning(true)} />;
    return <Register code={code} />;
  }
  return <Screens view={viewForPlayer(match, identity.email)} now={now} />;
}

function Register({ code }: { code: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  return (
    <>
      <h1>Caníbal</h1>
      <p className="subtitle">Capacitación · Partida en vivo</p>
      <h2>Unite a la partida</h2>
      <p className="lead">Ingresá tu nombre y tu email para identificarte.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const result = registerPlayer(code, name, email);
          setError(result.ok ? '' : errorText(result.error));
        }}
      >
        <label className="field" htmlFor="nombre">
          Nombre
        </label>
        <input id="nombre" type="text" placeholder="Lucía Pérez" value={name} onChange={(event) => setName(event.target.value)} />
        <label className="field" htmlFor="email">
          Email
        </label>
        <input id="email" type="email" placeholder="lucia@empresa.com" value={email} onChange={(event) => setEmail(event.target.value)} />
        <p className="note block">¿Ya te registraste en otro teléfono? Usá el mismo email para retomar tu lugar.</p>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn">
          Entrar a la partida
        </button>
      </form>
    </>
  );
}

function Closed({ code, returning, onReturn }: { code: string; returning: boolean; onReturn: () => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  return (
    <>
      <h1 className="block">Caníbal</h1>
      <div className="mark" />
      <h2 className="center-title">La partida ya comenzó</h2>
      <p className="lead center-copy">Ya se reveló la primera consigna. No se aceptan nuevos jugadores.</p>
      {returning ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const result = registerPlayer(code, 'Jugador', email);
            setError(result.ok ? '' : errorText(result.error));
          }}
        >
          <label className="field" htmlFor="volver">
            Email
          </label>
          <input id="volver" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn">
            Entrar a la partida
          </button>
        </form>
      ) : (
        <button type="button" className="btn secondary" onClick={onReturn}>
          Ya estaba registrado: ingresar con mi email
        </button>
      )}
    </>
  );
}

function Screens({ view, now }: { view: PlayerView; now: number }) {
  const me = view.me;
  if (!me) return <Missing />;
  const chip = roundChip(view.phase, view.round, view.rosterSize);
  if (view.phase === 'victory') return <Victory view={view} me={me} />;
  if (me.status === 'fired' && (view.phase === 'reveal_prompt' || view.phase === 'immunity_bid')) {
    return <StarWait view={view} me={me} now={now} chip={chip} />;
  }
  if (view.phase === 'lobby') return <Lobby view={view} me={me} />;
  if (view.phase === 'reveal_prompt') return <PromptShown view={view} me={me} chip={chip} />;
  if (view.phase === 'immunity_bid') return <Bid view={view} me={me} now={now} chip={chip} />;
  if (view.phase === 'reveal_bid') return <BidReveal view={view} me={me} chip={chip} />;
  if (view.phase === 'prep') return <Prep view={view} me={me} now={now} chip={chip} />;
  if (view.phase === 'speeches') return <Speeches view={view} me={me} now={now} chip={chip} />;
  if (view.phase === 'facilitator_bonus') return <Bonus view={view} me={me} chip={chip} />;
  if (view.phase === 'vote') return <Vote view={view} me={me} now={now} chip={chip} />;
  return <Results view={view} me={me} chip={chip} />;
}

function Lobby({ view, me }: { view: PlayerView; me: PlayerInMatch }) {
  const shown = [...view.players].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const extra = Math.max(0, shown.length - 6);
  return (
    <>
      <Header chip="Sala de espera" />
      <h2>¡Estás dentro, {me.name}!</h2>
      <div className="stats">
        <div className="stat">
          <p className="label">Tu ranking</p>
          <p className="value">{rankLabel(me.rank)}</p>
        </div>
        <div className="stat">
          <p className="label">Fichas de influencia</p>
          <p className="value">{me.tokens}</p>
        </div>
      </div>
      <p className="note block">Ranking aleatorio. Todos empiezan con 5 fichas.</p>
      <p className="block">
        <b>Jugadores conectados ({view.players.length})</b>
      </p>
      <ul className="people">
        {shown.slice(0, 6).map((player) => (
          <li key={player.email} className={player.email === me.email ? 'you' : ''}>
            {player.name}
            {player.email === me.email ? ' (vos)' : ''}
          </li>
        ))}
        {extra > 0 && <li>+{extra} más</li>}
      </ul>
      <p className="panel">Esperando que el facilitador revele la primera consigna…</p>
    </>
  );
}

function PromptShown({ view, me, chip }: { view: PlayerView; me: PlayerInMatch; chip: string }) {
  const count = slots(view.rosterSize, view.round);
  return (
    <>
      <Header chip={chip} />
      <Status me={me} label="Activo" />
      <p className="kicker">CONSIGNA DE LA RONDA</p>
      <div className="prompt">
        <p>{view.prompt?.text}</p>
      </div>
      <p className="lead">
        {isLastRound(view.rosterSize, view.round)
          ? 'En la última ronda todos los activos quedan nominados: la puja no da inmunidad.'
          : `Los ${count} jugadores que menos fichas pujen serán nominados y tendrán que responder esta consigna en voz alta.`}
      </p>
      <p className="panel">La puja empieza cuando el facilitador inicie el reloj.</p>
    </>
  );
}

function Bid({ view, me, now, chip }: { view: PlayerView; me: PlayerInMatch; now: number; chip: string }) {
  const [error, setError] = useState('');
  function setAmount(amount: number) {
    const result = updateMatch(view.code, (match) => setImmunityBid(match, me.email, amount, Date.now()));
    setError(result.ok ? '' : errorText(result.error));
  }
  return (
    <>
      <Header chip={chip} />
      {view.clock && <ClockRead deadline={view.clock.deadline} now={now} caption="Tiempo restante de la puja" />}
      <div className="prompt-soft">
        <p>{view.prompt?.text}</p>
      </div>
      <h2>¿Cuántas fichas pujás por tu inmunidad?</h2>
      <div className="stepper">
        <button type="button" className="btn-round" aria-label="Menos fichas" disabled={me.immunityBid <= 0} onClick={() => setAmount(me.immunityBid - 1)}>
          −
        </button>
        <span className="stepper-value">{me.immunityBid}</span>
        <button
          type="button"
          className="btn-round"
          aria-label="Más fichas"
          disabled={me.immunityBid >= me.tokens}
          onClick={() => setAmount(me.immunityBid + 1)}
        >
          +
        </button>
      </div>
      <p className="clock-caption">
        Saldo: {me.tokens} fichas · Te quedarían <b>{me.tokens - me.immunityBid}</b>
      </p>
      {error && <p className="error">{error}</p>}
      <p className="saved">
        ✓ Selección guardada. Podés cambiarla hasta que termine el reloj. Si no elegís nada, se registra 0. Nadie ve tu puja hasta la revelación.
      </p>
    </>
  );
}

function BidReveal({ view, me, chip }: { view: PlayerView; me: PlayerInMatch; chip: string }) {
  const [showAll, setShowAll] = useState(false);
  const nominated = view.nominees.includes(me.email);
  const rows = (view.bidSpends ?? [])
    .map((spend) => {
      const player = view.players.find((item) => item.email === spend.email);
      return {
        email: spend.email,
        name: player?.name ?? spend.email,
        rank: player?.rank ?? null,
        spent: spend.spent,
        nominated: view.nominees.includes(spend.email),
      };
    })
    .sort((a, b) => a.spent - b.spent || (b.rank ?? 0) - (a.rank ?? 0));
  const order = speakingOrder(view);
  return (
    <>
      <Header chip={chip} />
      {nominated ? (
        <div className="banner">
          <h2>Estás nominado</h2>
          <p>Vas a responder la consigna en voz alta.</p>
        </div>
      ) : (
        <div className="banner-outline">
          <h2>Estás a salvo esta ronda</h2>
          <p>
            Pujaste {rows.find((row) => row.email === me.email)?.spent ?? 0}{' '}
            {(rows.find((row) => row.email === me.email)?.spent ?? 0) === 1 ? 'ficha' : 'fichas'}. Vas a votar a los nominados.
          </p>
        </div>
      )}
      {nominated || showAll ? (
        <>
          <p className="block">
            <b>Lo que gastó cada jugador</b>
          </p>
          <table className="grid">
            <thead>
              <tr>
                <th>Jugador</th>
                <th>Rank</th>
                <th>Pujó</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.email} className={row.email === me.email ? 'me' : ''}>
                  <td>
                    {row.email === me.email ? <b>{row.name} (vos)</b> : row.name}
                  </td>
                  <td>{rankLabel(row.rank)}</td>
                  <td>{row.spent}</td>
                  <td>{row.nominated ? <b>Nominado</b> : 'A salvo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">Empate: se nomina al de peor ranking (número más alto).</p>
        </>
      ) : (
        <>
          <p className="block">
            <b>Nominados (responden en este orden)</b>
          </p>
          <ol className="order">
            {order.map((email) => {
              const row = rows.find((item) => item.email === email);
              return (
                <li key={email}>
                  {nameOf(view.players, email)} · {rankLabel(row?.rank ?? null)} · pujó {row?.spent ?? 0}
                </li>
              );
            })}
          </ol>
          <button type="button" className="btn secondary" onClick={() => setShowAll(true)}>
            Ver lo que gastó cada jugador
          </button>
          {isLastRound(view.rosterSize, view.round) && (
            <p className="note section">En la última ronda todos los activos quedan nominados: la puja no da inmunidad.</p>
          )}
        </>
      )}
    </>
  );
}

function Prep({ view, me, now, chip }: { view: PlayerView; me: PlayerInMatch; now: number; chip: string }) {
  const nominated = view.nominees.includes(me.email);
  const order = speakingOrder(view);
  return (
    <>
      <Header chip={chip} />
      {!nominated && <Status me={me} label="A salvo" />}
      {view.clock && <ClockRead deadline={view.clock.deadline} now={now} caption={nominated ? 'Preparate para responder' : ''} />}
      {!nominated && <p className="clock-caption">Los nominados se están preparando</p>}
      <div className={nominated ? 'prompt' : 'prompt-soft'}>
        <p>{view.prompt?.text}</p>
      </div>
      <p className="block">
        <b>{nominated ? 'Orden de habla' : 'Van a hablar'}</b>
      </p>
      <ol className="order">
        {order.map((email) => (
          <li key={email} className={email === me.email ? 'you' : ''}>
            {nameOf(view.players, email)} {rankLabel(view.players.find((player) => player.email === email)?.rank ?? null)}
            {email === me.email ? ' · Vos' : ''}
          </li>
        ))}
      </ol>
    </>
  );
}

function Speeches({ view, me, now, chip }: { view: PlayerView; me: PlayerInMatch; now: number; chip: string }) {
  const order = speakingOrder(view);
  const index = view.speakerIndex ?? 0;
  const current = order[index];
  const mine = current === me.email;
  const expired = view.clock !== null && now >= view.clock.deadline;
  return (
    <>
      <Header chip={chip} />
      {mine && view.clock ? (
        <div className="banner center">
          <h2>Es tu turno</h2>
          <p className="clock">{formatClock(view.clock.deadline, now)}</p>
          <p>{expired ? '¡Tiempo! Corte a los 60 segundos' : 'de 1:00 · corte estricto'}</p>
        </div>
      ) : (
        <div className="banner-outline center">
          <p className="kicker">Está hablando</p>
          <h2>
            {current ? `${nameOf(view.players, current)} · ${rankLabel(view.players.find((player) => player.email === current)?.rank ?? null)}` : '—'}
          </h2>
          {view.clock && <p className="clock">{formatClock(view.clock.deadline, now)}</p>}
          {expired && <p>¡Tiempo! Corte a los 60 segundos</p>}
        </div>
      )}
      <div className="prompt-soft">
        <p>{view.prompt?.text}</p>
      </div>
      <p className="block">
        <b>Turnos (de peor a mejor ranking)</b>
      </p>
      <ol className="order">
        {order.map((email, turn) => {
          const done = turn < index;
          const speaking = turn === index;
          return (
            <li key={email} className={done ? 'done' : speaking ? 'you' : ''}>
              {nameOf(view.players, email)} {rankLabel(view.players.find((player) => player.email === email)?.rank ?? null)}
              {done ? ' · listo' : speaking ? ' · hablando' : ''}
            </li>
          );
        })}
      </ol>
      <p className="note">La respuesta es en voz alta en la sala. La app no la graba.</p>
    </>
  );
}

function Bonus({ view, me, chip }: { view: PlayerView; me: PlayerInMatch; chip: string }) {
  const skipped = view.facilitatorBonus !== null && view.facilitatorBonus.length === 0;
  return (
    <>
      <Header chip={chip} />
      <Status me={me} label={view.nominees.includes(me.email) ? 'Nominado' : me.status === 'fired' ? 'Votante estrella' : 'A salvo'} />
      <h2>Bono público del facilitador</h2>
      <p className="lead">Estas fichas se suman al total de cada nominado antes de votar.</p>
      {view.facilitatorBonus === null && <p className="panel">Esperando que el facilitador asigne el bono…</p>}
      {skipped && <p className="panel">El facilitador no asignó bono esta ronda.</p>}
      {view.facilitatorBonus !== null && view.facilitatorBonus.length > 0 && (
        <table className="grid">
          <tbody>
            {view.nominees.map((email) => {
              const bonus = view.facilitatorBonus?.find((item) => item.nominee === email)?.tokens ?? 0;
              return (
                <tr key={email}>
                  <td>
                    {nameOf(view.players, email)} {rankLabel(view.players.find((player) => player.email === email)?.rank ?? null)}
                  </td>
                  <td className="num">{bonus > 0 ? <b>+{bonus}</b> : 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {view.facilitatorBonus === null && (
        <p className="note block">Si el facilitador omite el bono, no se suma ninguna ficha.</p>
      )}
      <p className="panel">La votación empieza cuando el facilitador inicie el reloj.</p>
    </>
  );
}

function Vote({ view, me, now, chip }: { view: PlayerView; me: PlayerInMatch; now: number; chip: string }) {
  const nominated = view.nominees.includes(me.email);
  const [error, setError] = useState('');
  if (nominated) {
    const mine = view.facilitatorBonus?.find((item) => item.nominee === me.email)?.tokens ?? 0;
    return (
      <>
        <Header chip={chip} />
        <Status me={me} label="Nominado" />
        {view.clock && <ClockRead deadline={view.clock.deadline} now={now} caption="" />}
        <h2 className="center-title">Los demás están votando</h2>
        <p className="lead center-copy">Como estás nominado, esta ronda no votás. Los 2 nominados con más fichas sobreviven.</p>
        <p className="prompt-soft center-copy">
          Tu bono público: <b>+{mine}</b>
        </p>
      </>
    );
  }

  const spentTokens = me.votes.reduce((sum, vote) => sum + vote.tokens, 0);
  const spentSpecial = me.votes.reduce((sum, vote) => sum + vote.specialTokens, 0);
  const freeTokens = me.tokens - spentTokens;
  const freeSpecial = me.specialTokens - spentSpecial;

  function change(email: string, tokens: number, specialTokens: number) {
    const allocation = view.nominees
      .map((nominee) => {
        const current = me.votes.find((vote) => vote.nominee === nominee);
        const base = nominee === email ? { tokens, specialTokens } : { tokens: current?.tokens ?? 0, specialTokens: current?.specialTokens ?? 0 };
        return { nominee, ...base };
      })
      .filter((vote) => vote.tokens + vote.specialTokens > 0);
    const result = updateMatch(view.code, (match) => setVote(match, me.email, allocation, Date.now()));
    setError(result.ok ? '' : errorText(result.error));
  }

  return (
    <>
      <Header chip={chip} />
      {view.clock && <ClockRead deadline={view.clock.deadline} now={now} caption="" />}
      <div className="bar">
        <span>
          Influencia: <b>{freeTokens} de {me.tokens}</b> libre
        </span>
        <span>
          {me.specialTokens === 1 ? 'Especial' : 'Especiales'}: <b>{freeSpecial} de {me.specialTokens}</b> libre
        </span>
      </div>
      <p className="note block">
        {me.status === 'fired'
          ? 'Votante estrella: 3 fichas especiales por ronda. Las que no uses se pierden.'
          : 'La ficha especial solo sirve para votar y se pierde si no la usás.'}
      </p>
      <table className="grid">
        <thead>
          <tr>
            <th>Nominado</th>
            <th>Influencia</th>
            <th>Especial</th>
          </tr>
        </thead>
        <tbody>
          {view.nominees.map((email) => {
            const vote = me.votes.find((item) => item.nominee === email);
            const tokens = vote?.tokens ?? 0;
            const special = vote?.specialTokens ?? 0;
            const bonus = view.facilitatorBonus?.find((item) => item.nominee === email)?.tokens ?? 0;
            const who = nameOf(view.players, email);
            return (
              <tr key={email}>
                <td>
                  {who} {rankLabel(view.players.find((player) => player.email === email)?.rank ?? null)}
                  {bonus > 0 && <span className="note"> bono +{bonus}</span>}
                </td>
                <td>
                  <span className="tiny">
                    <button type="button" className="btn-tiny" aria-label={`Menos influencia para ${who}`} disabled={tokens <= 0} onClick={() => change(email, tokens - 1, special)}>
                      −
                    </button>
                    <b>{tokens}</b>
                    <button type="button" className="btn-tiny" aria-label={`Más influencia para ${who}`} disabled={freeTokens <= 0} onClick={() => change(email, tokens + 1, special)}>
                      +
                    </button>
                  </span>
                </td>
                <td>
                  <span className="tiny">
                    <button type="button" className="btn-tiny" aria-label={`Menos especial para ${who}`} disabled={special <= 0} onClick={() => change(email, tokens, special - 1)}>
                      −
                    </button>
                    <b>{special}</b>
                    <button type="button" className="btn-tiny" aria-label={`Más especial para ${who}`} disabled={freeSpecial <= 0} onClick={() => change(email, tokens, special + 1)}>
                      +
                    </button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && <p className="error">{error}</p>}
      <p className="saved">
        ✓ Voto guardado. Podés poner varias fichas en el mismo nominado y cambiar hasta el cierre. Nadie ve tu voto.
        {me.status === 'fired' ? ' Si votás a un sobreviviente recuperás lo invertido + 2 fichas, igual que los activos.' : ''}
      </p>
    </>
  );
}

function Results({ view, me, chip }: { view: PlayerView; me: PlayerInMatch; chip: string }) {
  const results = view.results;
  if (!results) return <Header chip={chip} />;
  const firedMe = results.fired.includes(me.email);
  const place = results.totals.findIndex((total) => total.nominee === me.email) + 1;
  const ballot = results.ballots.find((item) => item.email === me.email);
  const mine = results.awards.filter((award) => award.email === me.email);
  const active = view.players.filter((player) => player.status === 'active').sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  return (
    <>
      <Header chip={chip} />
      {firedMe && (
        <>
          <div className="mark" />
          <h2 className="center-title">Fuiste despedido</h2>
          <p className="lead center-copy">
            Quedaste {place}.º con {results.totals.find((total) => total.nominee === me.email)?.total ?? 0} votos. Solo los 2 más votados sobreviven.
          </p>
          <div className="stats">
            <div className="stat">
              <p className="label">Conservás</p>
              <p className="value">{me.tokens} fichas</p>
            </div>
            <div className="stat">
              <p className="label">Ranking</p>
              <p className="value">—</p>
            </div>
          </div>
          <div className="banner">
            <b>Ahora sos Votante estrella.</b> Cada ronda recibís 3 fichas especiales para votar. No volvés a pujar ni a ser nominado.
          </div>
        </>
      )}
      <table className="grid">
        <thead>
          <tr>
            <th>Nominado</th>
            <th>Votos</th>
            <th>Bono</th>
            <th>Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {results.totals.map((total) => (
            <tr key={total.nominee} className={total.nominee === me.email ? 'me' : ''}>
              <td>
                {nameOf(view.players, total.nominee)}{' '}
                {rankLabel(
                  view.players.find((player) => player.email === total.nominee)?.rank ??
                    view.players.find((player) => player.email === total.nominee)?.rankWhenFired ??
                    null,
                )}
              </td>
              <td>{total.tokens + total.specialTokens}</td>
              <td>{total.bonus}</td>
              <td>
                <b>{total.total}</b>
              </td>
              <td>{results.survivors.includes(total.nominee) ? <b>Sobrevive</b> : 'Despedido'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="block">
        <b>Ranking</b>
      </p>
      <ul className="people">
        {active.map((player) => (
          <li key={player.email}>
            {player.name} {rankLabel(player.rank)} · {player.tokens} fichas
          </li>
        ))}
      </ul>
      {ballot && ballot.votes.length > 0 && (
        <>
          <p className="block">
            <b>Tu voto</b>
          </p>
          <ul className="people">
            {ballot.votes.map((vote) => (
              <li key={vote.nominee}>
                {nameOf(view.players, vote.nominee)}: {vote.tokens} influencia + {vote.specialTokens} especial
              </li>
            ))}
          </ul>
          <p className="dashed">
            {ballot.unusedSpecialTokens > 0 ? 'Tu ficha especial no usada se perdió.' : 'Fichas especiales sin usar: 0 perdidas.'}
          </p>
        </>
      )}
      {mine.length > 0 && (
        <div className="banner-outline">
          <b>Tus fichas</b>
          {mine.map((award, index) => (
            <p key={`${award.reason}-${award.survivor}-${index}`}>{awardLine(award, view)}</p>
          ))}
          <p>
            <b>
              Saldo: {me.tokens} fichas · {me.rank === null ? 'Sin ranking' : `Ranking ${rankLabel(me.rank)}`}
            </b>
          </p>
        </div>
      )}
    </>
  );
}

function Victory({ view, me }: { view: PlayerView; me: PlayerInMatch }) {
  const won = view.winners?.some((winner) => winner.email === me.email) ?? false;
  const total = view.winners?.length ?? 0;
  return (
    <>
      <Header chip="Fin de la partida" />
      {won ? (
        <div className="banner hero center">
          <h2>¡Ganaste!</h2>
          <p>Sos uno de los {total} ganadores de la partida.</p>
        </div>
      ) : (
        <div className="banner-outline hero center">
          <h2>Terminó la partida</h2>
          <p>Esta vez no estás entre los ganadores.</p>
        </div>
      )}
      <p className="block">
        <b>Ganadores</b>
      </p>
      <table className="grid">
        <tbody>
          {(view.winners ?? []).map((winner) => {
            const player = view.players.find((item) => item.email === winner.email);
            return (
              <tr key={winner.email} className={winner.email === me.email ? 'me' : ''}>
                <td>{winner.email === me.email ? <b>{player?.name ?? winner.email} (vos)</b> : (player?.name ?? winner.email)}</td>
                <td className="note">
                  {winner.kind === 'active' ? `Activo · ${rankLabel(player?.rank ?? null)}` : `Votante estrella · ${player?.tokens ?? 0} fichas`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!won && (
        <p className="panel">
          <b>Tu resultado</b>
          <br />
          {me.status === 'fired' ? `Despedido en la ronda ${me.firedInRound ?? '—'} · ` : ''}
          {me.tokens} fichas permanentes
        </p>
      )}
      <p className="note section">
        Los 2 activos que quedan ganan. Se suman los despedidos con más fichas permanentes (las especiales no cuentan). 7–24 jugadores: 1 · 25–42: 2 · 43–60: 3.
      </p>
    </>
  );
}

function StarWait({ view, me, now, chip }: { view: PlayerView; me: PlayerInMatch; now: number; chip: string }) {
  const phase =
    view.phase === 'immunity_bid' && view.clock
      ? `puja de los activos (${formatClock(view.clock.deadline, now)})`
      : 'consigna revelada';
  return (
    <>
      <Header chip={chip} />
      <Status me={me} label="Sin ranking" />
      <p className="kicker">CONSIGNA DE LA RONDA</p>
      <div className="prompt-soft">
        <p>{view.prompt?.text}</p>
      </div>
      <p className="block">
        <b>Fase actual: {phase}</b>
      </p>
      <p className="lead">No participás de la puja. Vas a ver los nominados y sus discursos, y te avisamos cuando empiece la votación.</p>
      <p className="banner-outline center">
        En la votación vas a recibir <b>3 fichas especiales</b>
      </p>
    </>
  );
}

function Status({ me, label }: { me: PlayerInMatch; label: string }) {
  if (me.status === 'fired') {
    return (
      <div className="bar">
        <span>
          <b>Votante estrella</b>
        </span>
        <span>
          <b>{me.tokens}</b> fichas
        </span>
        <span>Sin ranking</span>
      </div>
    );
  }
  return (
    <div className="bar">
      <span>
        Ranking <b>{rankLabel(me.rank)}</b>
      </span>
      <span>
        <b>{me.tokens}</b> fichas
      </span>
      <span>{label}</span>
    </div>
  );
}

function awardLine(award: TokenAward, view: PlayerView): string {
  const who = nameOf(view.players, award.survivor);
  if (award.reason === 'survivor_reward') return `Sobreviviste: +${award.amount} fichas`;
  if (award.reason === 'vote_refund') return `Votaste a ${who} (sobrevive): +${award.amount} fichas`;
  return `Máximo votante de ${who}: +${award.amount}`;
}

function formatClock(deadline: number, now: number): string {
  const total = Math.max(0, Math.ceil((deadline - now) / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}
