import { rankingOrder, rulesOf, speakingOrder, viewForPublic } from '../game';
import type { PublicPlayer, PublicView } from '../game';
import { Header, Missing, PlayerName } from './chrome';
import { nameOf, phaseName, rankLabel, roundChip, tokenBounds, tokenLabel } from './format';
import { useNow, useSession } from './useSession';

export function PublicMatch({ code }: { code: string }) {
  const session = useSession();
  const match = session.matches[code] ?? null;
  const now = useNow();
  if (session.missing[code]) return <Missing />;
  if (!match) return <p className="panel">{session.offline ? 'Sin conexión. Reintentando…' : 'Cargando…'}</p>;
  const view = viewForPublic(match);
  const chip = roundChip(view.phase, view.round, view.rosterSize, rulesOf(match));
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

  const players = view.players ?? [];
  const speaking = speakingOrder({ nominees: view.nominees ?? [], players });
  const rankedNominees = rankingOrder({ nominees: view.nominees ?? [], players });
  const speaker = view.phase === 'speeches' ? speaking[view.speakerIndex ?? 0] : undefined;
  const nomineeBounds = tokenBounds(rankedNominees.map((email) => players.find((player) => player.email === email)?.tokens ?? 0));
  const bonusConfirmed = view.facilitatorBonus !== null;
  const showRoster =
    rankedNominees.length > 0 &&
    !view.results &&
    (view.phase === 'reveal_bid' || view.phase === 'prep' || view.phase === 'speeches' || view.phase === 'facilitator_bonus');

  return (
    <>
      <Header chip={chip} />
      {view.phase === 'lobby' && (
        <>
          <h2>Jugadores conectados ({players.length})</h2>
          <People players={[...players].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))} />
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
      {view.phase === 'speeches' && speaker && (
        <div className="banner-outline center">
          <p className="kicker">Está hablando</p>
          <h2>
            <PlayerName
              name={nameOf(players, speaker)}
              tokens={players.find((player) => player.email === speaker)?.tokens ?? 0}
              least={nomineeBounds.least}
              most={nomineeBounds.most}
            />
            {` · ${rankLabel(players.find((player) => player.email === speaker)?.rank ?? null)} · ${tokenLabel(players.find((player) => player.email === speaker)?.tokens ?? 0)}`}
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
      {showRoster && (
        <>
          <p className="block">
            <b>Nominados</b>
          </p>
          {bonusConfirmed && view.facilitatorBonus?.length === 0 && <p className="note block">El facilitador no asignó bono esta ronda.</p>}
          <ul className="people">
            {rankedNominees.map((email) => {
              const player = players.find((item) => item.email === email);
              const bonus = view.facilitatorBonus?.find((item) => item.nominee === email)?.tokens ?? 0;
              return (
                <li key={email} className={email === speaker ? 'you' : ''}>
                  <PlayerName name={player?.name ?? email} tokens={player?.tokens ?? 0} least={nomineeBounds.least} most={nomineeBounds.most} />
                  {` · ${rankLabel(player?.rank ?? null)} · ${tokenLabel(player?.tokens ?? 0)}`}
                  {bonusConfirmed && ` · bono +${bonus}`}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {view.bidSpends && (
        <Spends view={view} players={players} />
      )}
      {view.results && (
        <>
          <Results view={view} players={players} />
          <p className="block">
            <b>Ranking</b>
          </p>
          <People players={players.filter((player) => player.status === 'active').sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))} />
        </>
      )}
      {view.phase === 'victory' && view.winners && (
        <>
          <h2>Ganadores</h2>
          <Winners view={view} players={players} />
        </>
      )}
      {view.phase !== 'lobby' && view.phase !== 'victory' && !view.results && <p className="note">Fase: {phaseName(view.phase)}</p>}
    </>
  );
}

function People({ players }: { players: PublicPlayer[] }) {
  const { least, most } = tokenBounds(players.map((player) => player.tokens));
  return (
    <ul className="people">
      {players.map((player) => (
        <li key={player.email}>
          <PlayerName name={player.name} tokens={player.tokens} least={least} most={most} />
          {` · ${rankLabel(player.rank)} · ${tokenLabel(player.tokens)}`}
        </li>
      ))}
    </ul>
  );
}

function Spends({ view, players }: { view: PublicView; players: PublicPlayer[] }) {
  const rows = (view.bidSpends ?? []).map((spend) => {
    const player = players.find((item) => item.email === spend.email);
    return { ...spend, name: player?.name ?? spend.email, tokens: player?.tokens ?? 0 };
  });
  const { least, most } = tokenBounds(rows.map((row) => row.tokens));
  return (
    <>
      <p className="block">
        <b>Pujas</b>
      </p>
      <table className="grid">
        <tbody>
          {rows.map((spend) => (
            <tr key={spend.email}>
              <td>
                <PlayerName name={spend.name} tokens={spend.tokens} least={least} most={most} />
                {` · ${tokenLabel(spend.tokens)}`}
              </td>
              <td>{spend.spent}</td>
              <td>{view.nominees?.includes(spend.email) ? <b>Nominado</b> : 'A salvo'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Results({ view, players }: { view: PublicView; players: PublicPlayer[] }) {
  const totals = rankingOrder({
    nominees: view.results?.totals.map((total) => total.nominee) ?? [],
    players,
  }).flatMap((email) => {
    const total = view.results?.totals.find((item) => item.nominee === email);
    return total ? [total] : [];
  });
  const listed = totals.map((total) => players.find((player) => player.email === total.nominee));
  const { least, most } = tokenBounds(listed.map((player) => player?.tokens ?? 0));
  return (
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
        {totals.map((total) => {
          const player = players.find((item) => item.email === total.nominee);
          const votes = total.tokens;
          return (
            <tr key={total.nominee}>
              <td>
                <PlayerName name={player?.name ?? total.nominee} tokens={player?.tokens ?? 0} least={least} most={most} />
                {` · ${rankLabel(player?.rank ?? player?.rankWhenFired ?? null)} · ${tokenLabel(player?.tokens ?? 0)}`}
              </td>
              <td>{votes}</td>
              <td>{total.bonus > 0 ? <b>+{total.bonus}</b> : 0}</td>
              <td>
                <b>{total.total}</b>
              </td>
              <td>{view.results?.survivors.includes(total.nominee) ? <b>Sobrevive</b> : 'Despedido'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Winners({ view, players }: { view: PublicView; players: PublicPlayer[] }) {
  const rows = (view.winners ?? []).map((winner) => {
    const player = players.find((item) => item.email === winner.email);
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
            <td className="note">
              {winner.kind === 'active'
                ? `Activo · ${rankLabel(player?.rank ?? null)} · ${tokenLabel(tokens)}`
                : `Despedido · ${tokenLabel(tokens)}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
