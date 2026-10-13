import { speakingOrder, viewForPublic } from '../game';
import { Header, Missing } from './chrome';
import { nameOf, phaseName, rankLabel, roundChip } from './format';
import { useNow, useSession } from './useSession';

export function PublicMatch({ code }: { code: string }) {
  const session = useSession();
  const match = session.matches[code] ?? null;
  const now = useNow();
  if (!match) return <Missing />;
  const view = viewForPublic(match);
  const chip = roundChip(view.phase, view.round, view.rosterSize);
  const secret = view.phase === 'immunity_bid' || view.phase === 'vote';

  if (secret) {
    const total = view.clock ? Math.max(0, Math.ceil((view.clock.deadline - now) / 1000)) : 0;
    return (
      <>
        <Header chip={chip} />
        {view.clock && <p className="clock">{`${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`}</p>}
        {view.prompt && (
          <div className="prompt">
            <p>{view.prompt.text}</p>
          </div>
        )}
        <p className="panel">{view.instructions}</p>
      </>
    );
  }

  const order = speakingOrder({ nominees: view.nominees ?? [], players: view.players ?? [] });
  const speaker = view.phase === 'speeches' ? order[view.speakerIndex ?? 0] : undefined;

  return (
    <>
      <Header chip={chip} />
      {view.phase === 'lobby' && (
        <>
          <h2>Jugadores conectados ({view.players?.length ?? 0})</h2>
          <ul className="people">
            {(view.players ?? [])
              .slice()
              .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
              .map((player) => (
                <li key={player.email}>
                  {player.name} · {rankLabel(player.rank)}
                </li>
              ))}
          </ul>
        </>
      )}
      {view.prompt && view.phase !== 'lobby' && (
        <>
          <p className="kicker">CONSIGNA</p>
          <div className="prompt">
            <p>{view.prompt.text}</p>
          </div>
        </>
      )}
      {view.phase === 'speeches' && speaker && view.players && (
        <div className="banner-outline center">
          <p className="kicker">Está hablando</p>
          <h2>
            {nameOf(view.players, speaker)} · {rankLabel(view.players.find((player) => player.email === speaker)?.rank ?? null)}
          </h2>
          {view.clock && (
            <p className="clock">
              {`${Math.floor(Math.max(0, Math.ceil((view.clock.deadline - now) / 1000)) / 60)}:${(Math.max(0, Math.ceil((view.clock.deadline - now) / 1000)) % 60).toString().padStart(2, '0')}`}
            </p>
          )}
        </div>
      )}
      {view.phase === 'prep' && view.clock && (
        <p className="clock">{`${Math.floor(Math.max(0, Math.ceil((view.clock.deadline - now) / 1000)) / 60)}:${(Math.max(0, Math.ceil((view.clock.deadline - now) / 1000)) % 60).toString().padStart(2, '0')}`}</p>
      )}
      {order.length > 0 && (view.phase === 'reveal_bid' || view.phase === 'prep' || view.phase === 'speeches') && (
        <>
          <p className="block">
            <b>Nominados</b>
          </p>
          <ol className="order">
            {order.map((email) => (
              <li key={email} className={email === speaker ? 'you' : ''}>
                {nameOf(view.players ?? [], email)}
              </li>
            ))}
          </ol>
        </>
      )}
      {view.bidSpends && view.players && (
        <>
          <p className="block">
            <b>Pujas</b>
          </p>
          <table className="grid">
            <tbody>
              {view.bidSpends.map((spend) => (
                <tr key={spend.email}>
                  <td>{nameOf(view.players ?? [], spend.email)}</td>
                  <td>{spend.spent}</td>
                  <td>{view.nominees?.includes(spend.email) ? <b>Nominado</b> : 'A salvo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {view.results && view.players && (
        <>
          <table className="grid">
            <thead>
              <tr>
                <th>Nominado</th>
                <th>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {view.results.totals.map((total) => (
                <tr key={total.nominee}>
                  <td>{nameOf(view.players ?? [], total.nominee)}</td>
                  <td>
                    <b>{total.total}</b>
                  </td>
                  <td>{view.results?.survivors.includes(total.nominee) ? <b>Sobrevive</b> : 'Despedido'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="block">
            <b>Ranking</b>
          </p>
          <ul className="people">
            {view.players
              .filter((player) => player.status === 'active')
              .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
              .map((player) => (
                <li key={player.email}>
                  {player.name} {rankLabel(player.rank)} · {player.tokens} fichas
                </li>
              ))}
          </ul>
        </>
      )}
      {view.phase === 'victory' && view.winners && view.players && (
        <>
          <h2>Ganadores</h2>
          <table className="grid">
            <tbody>
              {view.winners.map((winner) => {
                const player = view.players?.find((item) => item.email === winner.email);
                return (
                  <tr key={winner.email}>
                    <td>{player?.name ?? winner.email}</td>
                    <td className="note">
                      {winner.kind === 'active' ? `Activo · ${rankLabel(player?.rank ?? null)}` : `Votante estrella · ${player?.tokens ?? 0} fichas`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      {view.players && view.phase !== 'lobby' && view.phase !== 'victory' && !view.results && (
        <p className="note">Fase: {phaseName(view.phase)}</p>
      )}
    </>
  );
}
