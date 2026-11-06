import { rankingOrder, rulesOf, speakingOrder, viewForPublic } from '../game';
import type { PublicPlayer, PublicView } from '../game';
import { QRCodeSVG } from 'qrcode.react';
import { ActivePlayersList } from './ActivePlayersList';
import { Header, Missing, PlayerName } from './chrome';
import { FiredPlayersList } from './FiredPlayersList';
import { nameOf, phaseName, rankLabel, roundChip, tokenBounds, tokenLabel } from './format';
import { playerJoinUrl } from './FacilitatorMatch';
import { RewardsBoard, SpeakingQueue, VoteRevealBoard } from './NomineeBoard';
import { awardDeltas, playersBeforeDeltas, spendDeltas } from './rosterDeltas';
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
  const players = view.players;
  const nomineeSet = view.phase === 'reveal_bid' || view.phase === 'reveal_vote' ? (view.nominees ?? []) : [];
  const activeDeltas =
    view.phase === 'reveal_bid'
      ? spendDeltas(view.bidSpends, '-')
      : view.phase === 'reveal_vote'
        ? spendDeltas(view.voteSpends, '-')
        : view.phase === 'round_end'
          ? awardDeltas(view.results?.awards)
          : undefined;
  const firedDeltas =
    view.phase === 'reveal_vote'
      ? spendDeltas(view.voteSpends, '-')
      : view.phase === 'round_end'
        ? awardDeltas(view.results?.awards)
        : undefined;
  // Bid/award tokens are already post-delta in match state; peel so the lists can re-apply for display.
  const alreadyApplied = view.phase === 'reveal_bid' || view.phase === 'round_end';
  const activePlayers = alreadyApplied ? playersBeforeDeltas(players, activeDeltas) : players;
  const firedPlayers = alreadyApplied ? playersBeforeDeltas(players, firedDeltas) : players;

  return (
    <div className="public-shell">
      <Header chip={chip} />
      <div className="public-layout">
        <aside className="public-side">
          <h2>Activos</h2>
          <ActivePlayersList players={activePlayers} deltaByEmail={activeDeltas} highlightEmails={nomineeSet} />
        </aside>
        <main className="public-main">
          {secret ? <SecretPhase view={view} now={now} /> : <OpenPhase view={view} now={now} players={players} joinUrl={playerJoinUrl(code)} />}
        </main>
        <aside className="public-side">
          <h2>Despedidos</h2>
          <FiredPlayersList players={firedPlayers} deltaByEmail={firedDeltas} />
        </aside>
      </div>
    </div>
  );
}

function SecretPhase({ view, now }: { view: PublicView; now: number }) {
  const total = view.clock ? Math.max(0, Math.ceil((view.clock.deadline - now) / 1000)) : 0;
  return (
    <>
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

function OpenPhase({ view, now, players, joinUrl }: { view: PublicView; now: number; players: PublicPlayer[]; joinUrl: string }) {
  const speaking = speakingOrder({ nominees: view.nominees ?? [], players, bidSpends: view.bidSpends });
  const rankedNominees = rankingOrder({ nominees: view.nominees ?? [], players });
  const speaker = view.phase === 'speeches' ? speaking[view.speakerIndex ?? 0] : undefined;
  const nomineeBounds = tokenBounds(rankedNominees.map((email) => players.find((player) => player.email === email)?.tokens ?? 0));
  const bonusConfirmed = view.facilitatorBonus !== null;
  const showRoster =
    rankedNominees.length > 0 &&
    !view.results &&
    (view.phase === 'prep' || view.phase === 'speeches' || view.phase === 'facilitator_bonus');

  if (view.phase === 'reveal_bid') {
    return (
      <>
        {view.prompt && (
          <>
            <p className="kicker">CONSIGNA</p>
            <div className="prompt">
              <p>{view.prompt.text}</p>
            </div>
          </>
        )}
        <SpeakingQueue nominees={view.nominees ?? []} players={players} bidSpends={view.bidSpends} />
        <p className="note">Fase: {phaseName(view.phase)}</p>
      </>
    );
  }

  if (view.phase === 'reveal_vote' && view.results) {
    return (
      <>
        <h2>Resultados de la votación</h2>
        <VoteRevealBoard nominees={view.nominees ?? []} players={players} bidSpends={view.bidSpends} results={view.results} />
        <p className="note">Fase: {phaseName(view.phase)}</p>
      </>
    );
  }

  if (view.phase === 'round_end' && view.results) {
    return (
      <>
        <h2>Recompensas</h2>
        <RewardsBoard results={view.results} players={players} />
        <p className="note">Fase: {phaseName(view.phase)}</p>
      </>
    );
  }

  return (
    <>
      {view.phase === 'lobby' && (
        <>
          <label className="field" htmlFor="join">
            Link de jugadores
          </label>
          <input id="join" type="text" readOnly value={joinUrl} />
          <div className="qr">
            <QRCodeSVG value={joinUrl} size={196} marginSize={4} bgColor="#ffffff" fgColor="#222222" title="Código QR del link de jugadores" />
          </div>
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
            {speaking.map((email) => {
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
