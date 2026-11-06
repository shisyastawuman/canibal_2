import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { nominatesAllActive, rankingOrder, rulesOf, speakingOrder, survivorsThisRound, viewForPlayer } from '../game';
import type { PlayerInMatch, PlayerView, TokenAward } from '../game';
import { placeBid, placeVote, registerPlayer } from '../session';
import { ActivePlayersList } from './ActivePlayersList';
import { ClockRead, Header, Missing, PlayerName } from './chrome';
import { FiredPlayersList } from './FiredPlayersList';
import { actionError, freeTokenLabel, nameOf, rankLabel, roundChip, slots, tokenBounds, tokenLabel, winnerRuleText } from './format';
import { RewardsBoard, SpeakingQueue, VoteRevealBoard } from './NomineeBoard';
import { awardDeltas, playersBeforeDeltas, spendDeltas } from './rosterDeltas';
import { useAutoClose, useNow, usePlayer, useSession } from './useSession';

type PlayerPane = 'active' | 'phase' | 'fired';

export function PlayerMatch({ code }: { code: string }) {
  const session = useSession();
  const match = session.matches[code] ?? null;
  const identity = usePlayer(code);
  const [returning, setReturning] = useState(false);
  useAutoClose(match);
  const now = useNow();
  if (session.missing[code]) return <Missing />;
  if (!match) return <p className="panel">{session.offline ? 'Sin conexión. Reintentando…' : 'Cargando…'}</p>;

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
      <p className="subtitle">¿Tenés lo que hace falta para sobrevivir?</p>
      <h2>Unite a la partida</h2>
      <p className="lead">Ingresá tu nombre y tu email para identificarte.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void registerPlayer(code, name, email).then((result) => setError(result.ok ? '' : actionError(result.error)));
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
            void registerPlayer(code, 'Jugador', email).then((result) => setError(result.ok ? '' : actionError(result.error)));
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
  const [pane, setPane] = useState<PlayerPane>('phase');
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  if (!me) return <Missing />;

  const fired = me.status === 'fired';
  const nomineeSet = view.phase === 'reveal_bid' || view.phase === 'reveal_vote' ? view.nominees : [];
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
  const alreadyApplied = view.phase === 'reveal_bid' || view.phase === 'round_end';
  const activePlayers = alreadyApplied ? playersBeforeDeltas(view.players, activeDeltas) : view.players;
  const firedPlayers = alreadyApplied ? playersBeforeDeltas(view.players, firedDeltas) : view.players;

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0) {
      // Swipe left → active players (or back to phase from fired)
      setPane((current) => (current === 'fired' ? 'phase' : 'active'));
      return;
    }
    // Swipe right → fired players (or back to phase from active)
    setPane((current) => (current === 'active' ? 'phase' : 'fired'));
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (swipe.current?.id === event.pointerId) swipe.current = null;
  }

  return (
    <div className={`player-shell${fired ? ' player-shell-fired' : ' player-shell-active'}`}>
      <Header chip={roundChip(view.phase, view.round, view.rosterSize, rulesOf(view))} />
      <Status view={view} me={me} />
      <div className="player-panes" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
        {pane === 'active' && (
          <Pane title="Activos">
            <ActivePlayersList
              players={activePlayers}
              highlightEmail={me.email}
              deltaByEmail={activeDeltas}
              highlightEmails={nomineeSet}
            />
          </Pane>
        )}
        {pane === 'phase' && <Phase view={view} me={me} now={now} />}
        {pane === 'fired' && (
          <Pane title="Despedidos">
            <FiredPlayersList players={firedPlayers} highlightEmail={me.email} deltaByEmail={firedDeltas} />
          </Pane>
        )}
      </div>
      <nav className="player-tabs" aria-label="Vistas del jugador">
        <TabButton label="Activos" active={pane === 'active'} onClick={() => setPane('active')}>
          <PeopleIcon />
        </TabButton>
        <TabButton label="Fase" active={pane === 'phase'} onClick={() => setPane('phase')}>
          <PhaseIcon />
        </TabButton>
        <TabButton label="Despedidos" active={pane === 'fired'} onClick={() => setPane('fired')}>
          <FiredIcon />
        </TabButton>
      </nav>
    </div>
  );
}

function Pane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="player-pane">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function TabButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`player-tab${active ? ' active' : ''}`} aria-label={label} aria-current={active ? 'page' : undefined} onClick={onClick}>
      {children}
      <span>{label}</span>
    </button>
  );
}

function PeopleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.6 0-5 1.4-5 3.2V19h10v-2.8C13 14.4 10.6 13 8 13Zm8 0c-.4 0-.8 0-1.2.1 1.3.9 2.2 2.1 2.2 3.5V19h5v-2.8c0-1.8-2.4-3.2-6-3.2Z"
      />
    </svg>
  );
}

function PhaseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6h16M4 12h10M4 18h14"
      />
    </svg>
  );
}

function FiredIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3 4 19h16L12 3Zm0 6v5m0 3h.01"
      />
    </svg>
  );
}

function Phase({ view, me, now }: { view: PlayerView; me: PlayerInMatch; now: number }) {
  if (view.phase === 'victory') return <Victory view={view} me={me} />;
  if (me.status === 'fired' && (view.phase === 'reveal_prompt' || view.phase === 'immunity_bid')) {
    return <StarWait view={view} now={now} />;
  }
  if (view.phase === 'lobby') return <Lobby view={view} me={me} />;
  if (view.phase === 'reveal_prompt') return <PromptShown view={view} />;
  if (view.phase === 'immunity_bid') return <Bid view={view} me={me} now={now} />;
  if (view.phase === 'reveal_bid') return <BidReveal view={view} me={me} />;
  if (view.phase === 'prep') return <Prep view={view} me={me} now={now} />;
  if (view.phase === 'speeches') return <Speeches view={view} me={me} now={now} />;
  if (view.phase === 'facilitator_bonus') return <Bonus view={view} />;
  if (view.phase === 'vote') return <Vote view={view} me={me} now={now} />;
  if (view.phase === 'reveal_vote') return <VoteReveal view={view} me={me} />;
  if (view.phase === 'round_end') return <RoundRewards view={view} me={me} />;
  return <Results view={view} me={me} />;
}

function Lobby({ view, me }: { view: PlayerView; me: PlayerInMatch }) {
  const shown = [...view.players].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const extra = Math.max(0, shown.length - 6);
  const { least, most } = tokenBounds(shown.map((player) => player.tokens));
  return (
    <>
      <h2>¡Estás dentro, {me.name}!</h2>
      <p className="note block">Ranking aleatorio. Todos empiezan con {tokenLabel(rulesOf(view).startingInfluenceTokens)}.</p>
      <p className="block">
        <b>Jugadores conectados ({view.players.length})</b>
      </p>
      <ul className="people">
        {shown.slice(0, 6).map((player) => (
          <li key={player.email} className={player.email === me.email ? 'you' : ''}>
            <PlayerName name={player.name} tokens={player.tokens} least={least} most={most} />
            {player.email === me.email ? ' (vos)' : ''}
            {` · ${tokenLabel(player.tokens)}`}
          </li>
        ))}
        {extra > 0 && <li>+{extra} más</li>}
      </ul>
      <p className="panel">Esperando que el facilitador revele la primera consigna…</p>
    </>
  );
}

function PromptShown({ view }: { view: PlayerView }) {
  const count = slots(view.rosterSize, view.round, rulesOf(view));
  return (
    <>
      <p className="kicker">CONSIGNA DE LA RONDA</p>
      <div className="prompt">
        <p>{view.prompt?.text}</p>
      </div>
      <p className="lead">
        {view.rosterSize !== null && nominatesAllActive(view.rosterSize, view.round, rulesOf(view))
          ? 'En esta ronda todos los activos quedan nominados: la puja no da inmunidad.'
          : `Los ${count} jugadores que menos fichas pujen serán nominados y tendrán que responder esta consigna en voz alta.`}
      </p>
      <p className="panel">La puja empieza cuando el facilitador inicie el reloj.</p>
    </>
  );
}

function Bid({ view, me, now }: { view: PlayerView; me: PlayerInMatch; now: number }) {
  const [error, setError] = useState('');
  function setAmount(amount: number) {
    void placeBid(view.code, me.email, amount).then((result) => setError(result.ok ? '' : actionError(result.error)));
  }
  return (
    <>
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

function BidReveal({ view, me }: { view: PlayerView; me: PlayerInMatch }) {
  const nominated = view.nominees.includes(me.email);
  const spent = view.bidSpends?.find((item) => item.email === me.email)?.spent ?? 0;
  return (
    <>
      {nominated ? (
        <div className="banner">
          <h2>Estás nominado</h2>
          <p>Vas a responder la consigna en voz alta.</p>
        </div>
      ) : (
        <div className="banner-outline">
          <h2>Estás a salvo esta ronda</h2>
          <p>
            Pujaste {spent} {spent === 1 ? 'ficha' : 'fichas'}. Vas a votar a los nominados.
          </p>
        </div>
      )}
      <SpeakingQueue nominees={view.nominees} players={view.players} bidSpends={view.bidSpends} meEmail={me.email} />
      {view.rosterSize !== null && nominatesAllActive(view.rosterSize, view.round, rulesOf(view)) && (
        <p className="note section">En esta ronda todos los activos quedan nominados: la puja no da inmunidad.</p>
      )}
    </>
  );
}

function VoteReveal({ view, me }: { view: PlayerView; me: PlayerInMatch }) {
  const results = view.results;
  if (!results) return null;
  return (
    <>
      <h2>Resultados de la votación</h2>
      <p className="lead">Se reordenan los nominados según los votos recibidos.</p>
      <VoteRevealBoard
        nominees={view.nominees}
        players={view.players}
        bidSpends={view.bidSpends}
        results={results}
        meEmail={me.email}
      />
    </>
  );
}

function RoundRewards({ view, me }: { view: PlayerView; me: PlayerInMatch }) {
  const results = view.results;
  if (!results) return null;
  const firedMe = results.fired.includes(me.email);
  const mine = results.awards.filter((award) => award.email === me.email);
  return (
    <>
      {firedMe ? (
        <div className="banner">
          <h2>Fuiste despedido</h2>
          <p>Conservás {tokenLabel(me.tokens)}. Cada ronda recibís {freeTokenLabel(rulesOf(view).freeTokensForFiredVoters)} para votar.</p>
        </div>
      ) : (
        <h2>Recompensas de la ronda</h2>
      )}
      <RewardsBoard results={results} players={view.players} meEmail={me.email} />
      {mine.length > 0 && (
        <div className="banner-outline">
          <b>Tus fichas</b>
          {mine.map((award, index) => (
            <p key={`${award.reason}-${award.survivor}-${index}`}>{awardLine(award, view)}</p>
          ))}
        </div>
      )}
    </>
  );
}

function Prep({ view, me, now }: { view: PlayerView; me: PlayerInMatch; now: number }) {
  const nominated = view.nominees.includes(me.email);
  const order = speakingOrder(view);
  const { least, most } = tokenBounds(order.map((email) => view.players.find((player) => player.email === email)?.tokens ?? 0));
  return (
    <>
      {view.clock && <ClockRead deadline={view.clock.deadline} now={now} caption={nominated ? 'Preparate para responder' : ''} />}
      {!nominated && <p className="clock-caption">Los nominados se están preparando</p>}
      <div className={nominated ? 'prompt' : 'prompt-soft'}>
        <p>{view.prompt?.text}</p>
      </div>
      <p className="block">
        <b>{nominated ? 'Orden de habla' : 'Van a hablar'}</b>
      </p>
      <ol className="order">
        {order.map((email) => {
          const player = view.players.find((item) => item.email === email);
          return (
            <li key={email} className={email === me.email ? 'you' : ''}>
              <PlayerName name={player?.name ?? email} tokens={player?.tokens ?? 0} least={least} most={most} />
              {` ${rankLabel(player?.rank ?? null)} · ${tokenLabel(player?.tokens ?? 0)}`}
              {email === me.email ? ' · Vos' : ''}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Speeches({ view, me, now }: { view: PlayerView; me: PlayerInMatch; now: number }) {
  const order = speakingOrder(view);
  const index = view.speakerIndex ?? 0;
  const current = order[index];
  const mine = current === me.email;
  const expired = view.clock !== null && now >= view.clock.deadline;
  const { least, most } = tokenBounds(order.map((email) => view.players.find((player) => player.email === email)?.tokens ?? 0));
  const currentPlayer = view.players.find((player) => player.email === current);
  return (
    <>
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
            {current ? (
              <>
                <PlayerName name={nameOf(view.players, current)} tokens={currentPlayer?.tokens ?? 0} least={least} most={most} />
                {` · ${rankLabel(currentPlayer?.rank ?? null)} · ${tokenLabel(currentPlayer?.tokens ?? 0)}`}
              </>
            ) : (
              '—'
            )}
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
          const player = view.players.find((item) => item.email === email);
          const name = player?.name ?? email;
          return (
            <li key={email} className={done ? 'done' : speaking ? 'you' : ''}>
              {done ? name : <PlayerName name={name} tokens={player?.tokens ?? 0} least={least} most={most} />}
              {` ${rankLabel(player?.rank ?? null)} · ${tokenLabel(player?.tokens ?? 0)}`}
              {done ? ' · listo' : speaking ? ' · hablando' : ''}
            </li>
          );
        })}
      </ol>
      <p className="note">La respuesta es en voz alta en la sala. La app no la graba.</p>
    </>
  );
}

function Bonus({ view }: { view: PlayerView }) {
  const confirmed = view.facilitatorBonus !== null;
  const skipped = confirmed && view.facilitatorBonus?.length === 0;
  const order = rankingOrder(view);
  const listed = order.map((email) => view.players.find((player) => player.email === email));
  const { least, most } = tokenBounds(listed.map((player) => player?.tokens ?? 0));
  return (
    <>
      <h2>Bono público del facilitador</h2>
      <p className="lead">Estas fichas se suman al total de cada nominado antes de votar.</p>
      {!confirmed && <p className="panel">Esperando que el facilitador asigne el bono…</p>}
      {skipped && <p className="panel">El facilitador no asignó bono esta ronda.</p>}
      <table className="grid">
        <tbody>
          {order.map((email) => {
            const player = view.players.find((item) => item.email === email);
            const bonus = view.facilitatorBonus?.find((item) => item.nominee === email)?.tokens ?? 0;
            return (
              <tr key={email}>
                <td>
                  <PlayerName name={player?.name ?? email} tokens={player?.tokens ?? 0} least={least} most={most} />
                  {` ${rankLabel(player?.rank ?? null)} · ${tokenLabel(player?.tokens ?? 0)}`}
                </td>
                {confirmed && <td className="num">{bonus > 0 ? <b>+{bonus}</b> : 0}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!confirmed && <p className="note block">Si el facilitador omite el bono, no se suma ninguna ficha.</p>}
      <p className="panel">La votación empieza cuando el facilitador inicie el reloj.</p>
    </>
  );
}

function Vote({ view, me, now }: { view: PlayerView; me: PlayerInMatch; now: number }) {
  const nominated = view.nominees.includes(me.email);
  const [error, setError] = useState('');
  if (nominated) {
    const mine = view.facilitatorBonus?.find((item) => item.nominee === me.email)?.tokens ?? 0;
    return (
      <>
        {view.clock && <ClockRead deadline={view.clock.deadline} now={now} caption="" />}
        <h2 className="center-title">Los demás están votando</h2>
        <p className="lead center-copy">Como estás nominado, esta ronda no votás. {survivorSentence(survivorsThisRound(activePlayers(view), view.nominees.length, rulesOf(view)))}</p>
        {view.facilitatorBonus !== null && (
          <p className="prompt-soft center-copy">
            Tu bono público: <b>+{mine}</b>
          </p>
        )}
      </>
    );
  }

  const placed = me.votes.reduce((sum, vote) => sum + vote.tokens, 0);
  const freeSpent = Math.min(me.freeTokens, placed);
  const influenceLeft = me.tokens - (placed - freeSpent);
  const freeLeft = me.freeTokens - freeSpent;
  const order = rankingOrder(view);
  const { least, most } = tokenBounds(order.map((email) => view.players.find((player) => player.email === email)?.tokens ?? 0));
  const bonusConfirmed = view.facilitatorBonus !== null;

  function change(email: string, next: number) {
    const allocation = view.nominees
      .map((nominee) => {
        const current = me.votes.find((vote) => vote.nominee === nominee);
        const tokens = nominee === email ? next : (current?.tokens ?? 0);
        return { nominee, tokens };
      })
      .filter((vote) => vote.tokens > 0);
    void placeVote(view.code, me.email, allocation).then((result) => setError(result.ok ? '' : actionError(result.error)));
  }

  return (
    <>
      {view.clock && <ClockRead deadline={view.clock.deadline} now={now} caption="" />}
      <div className="bar">
        <span>
          Influencia: <b>{influenceLeft} de {me.tokens}</b>
        </span>
        <span>
          Libres: <b>{freeLeft} de {me.freeTokens}</b>
        </span>
      </div>
      <p className="note block">
        {me.status === 'fired'
          ? `Despedido: ${freeTokenLabel(rulesOf(view).freeTokensForFiredVoters)} por ronda. Se gastan primero y las que no uses se pierden.`
          : 'Las fichas libres se gastan primero. Solo sirven para votar y se pierden si no las usás.'}
      </p>
      <table className="grid">
        <thead>
          <tr>
            <th>Nominado</th>
            <th>Fichas</th>
          </tr>
        </thead>
        <tbody>
          {order.map((email) => {
            const vote = me.votes.find((item) => item.nominee === email);
            const tokens = vote?.tokens ?? 0;
            const player = view.players.find((item) => item.email === email);
            const bonus = view.facilitatorBonus?.find((item) => item.nominee === email)?.tokens ?? 0;
            const who = player?.name ?? email;
            return (
              <tr key={email}>
                <td>
                  <PlayerName name={who} tokens={player?.tokens ?? 0} least={least} most={most} />
                  {` ${rankLabel(player?.rank ?? null)} · ${tokenLabel(player?.tokens ?? 0)}`}
                  {bonusConfirmed && bonus > 0 && <span className="note">{` bonus +${bonus}`}</span>}
                </td>
                <td>
                  <span className="tiny">
                    <button type="button" className="btn-tiny" aria-label={`Menos fichas para ${who}`} disabled={tokens <= 0} onClick={() => change(email, tokens - 1)}>
                      −
                    </button>
                    <b>{tokens}</b>
                    <button type="button" className="btn-tiny" aria-label={`Más fichas para ${who}`} disabled={influenceLeft + freeLeft <= 0} onClick={() => change(email, tokens + 1)}>
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
        {me.status === 'fired'
          ? ` Si votás a un sobreviviente recuperás lo invertido + ${rulesOf(view).extraTokensForVotingASurvivor} fichas, igual que los activos.`
          : ''}
      </p>
    </>
  );
}

function Results({ view, me }: { view: PlayerView; me: PlayerInMatch }) {
  const results = view.results;
  if (!results) return null;
  const firedMe = results.fired.includes(me.email);
  const place = results.totals.findIndex((total) => total.nominee === me.email) + 1;
  const ballot = results.ballots.find((item) => item.email === me.email);
  const mine = results.awards.filter((award) => award.email === me.email);
  const active = view.players.filter((player) => player.status === 'active').sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const rankedTotals = rankingOrder({ nominees: results.totals.map((total) => total.nominee), players: view.players }).flatMap((email) => {
    const total = results.totals.find((item) => item.nominee === email);
    return total ? [total] : [];
  });
  const nomineeBounds = tokenBounds(
    rankedTotals.map((total) => view.players.find((player) => player.email === total.nominee)?.tokens ?? 0),
  );
  const activeBounds = tokenBounds(active.map((player) => player.tokens));
  const ballotBounds = tokenBounds(
    (ballot?.votes ?? []).map((vote) => view.players.find((player) => player.email === vote.nominee)?.tokens ?? 0),
  );
  return (
    <>
      {firedMe && (
        <>
          <div className="mark" />
          <h2 className="center-title">Fuiste despedido</h2>
          <p className="lead center-copy">
            Quedaste {place}.º con {results.totals.find((total) => total.nominee === me.email)?.total ?? 0} votos. {survivorSentence(results.survivors.length)}
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
            <b>Ahora sos Despedido.</b> Cada ronda recibís {freeTokenLabel(rulesOf(view).freeTokensForFiredVoters)} para votar. No volvés a pujar ni a ser nominado.
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
          {rankedTotals.map((total) => {
            const player = view.players.find((item) => item.email === total.nominee);
            const name = player?.name ?? total.nominee;
            return (
            <tr key={total.nominee} className={total.nominee === me.email ? 'me' : ''}>
              <td>
                {total.nominee === me.email ? (
                  <b>
                    <PlayerName name={name} tokens={player?.tokens ?? 0} least={nomineeBounds.least} most={nomineeBounds.most} /> (vos)
                  </b>
                ) : (
                  <PlayerName name={name} tokens={player?.tokens ?? 0} least={nomineeBounds.least} most={nomineeBounds.most} />
                )}
                {` ${rankLabel(player?.rank ?? player?.rankWhenFired ?? null)} · ${tokenLabel(player?.tokens ?? 0)}`}
              </td>
              <td>{total.tokens}</td>
              <td>{total.bonus}</td>
              <td>
                <b>{total.total}</b>
              </td>
              <td>{results.survivors.includes(total.nominee) ? <b>Sobrevive</b> : 'Despedido'}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
      <p className="block">
        <b>Ranking</b>
      </p>
      <ul className="people">
        {active.map((player) => (
          <li key={player.email}>
            <PlayerName name={player.name} tokens={player.tokens} least={activeBounds.least} most={activeBounds.most} />
            {` ${rankLabel(player.rank)} · ${tokenLabel(player.tokens)}`}
          </li>
        ))}
      </ul>
      {ballot && ballot.votes.length > 0 && (
        <>
          <p className="block">
            <b>Tu voto</b>
          </p>
          <ul className="people">
            {rankingOrder({ nominees: ballot.votes.map((vote) => vote.nominee), players: view.players }).map((email) => {
              const vote = ballot.votes.find((item) => item.nominee === email);
              const player = view.players.find((item) => item.email === email);
              return (
                <li key={email}>
                  <PlayerName name={player?.name ?? email} tokens={player?.tokens ?? 0} least={ballotBounds.least} most={ballotBounds.most} />
                  {` · ${tokenLabel(player?.tokens ?? 0)}: ${tokenLabel(vote?.tokens ?? 0)}`}
                </li>
              );
            })}
          </ul>
          <p className="dashed">
            {ballot.unusedFreeTokens > 0 ? `Se ${ballot.unusedFreeTokens === 1 ? 'perdió' : 'perdieron'} ${freeTokenLabel(ballot.unusedFreeTokens)} sin usar.` : 'Fichas libres sin usar: 0 perdidas.'}
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
  const rows = (view.winners ?? []).map((winner) => {
    const player = view.players.find((item) => item.email === winner.email);
    return { winner, player, tokens: player?.tokens ?? 0 };
  });
  const { least, most } = tokenBounds(rows.map((row) => row.tokens));
  return (
    <>
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
          {rows.map(({ winner, player, tokens }) => {
            const name = player?.name ?? winner.email;
            return (
              <tr key={winner.email} className={winner.email === me.email ? 'me' : ''}>
                <td>
                  {winner.email === me.email ? (
                    <b>
                      <PlayerName name={name} tokens={tokens} least={least} most={most} /> (vos)
                    </b>
                  ) : (
                    <PlayerName name={name} tokens={tokens} least={least} most={most} />
                  )}
                </td>
                <td className="note">
                  {winner.kind === 'active' ? `Activo · ${rankLabel(player?.rank ?? null)} · ${tokenLabel(tokens)}` : `Despedido · ${tokenLabel(tokens)}`}
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
        {winnerRuleText(rulesOf(view))}
      </p>
    </>
  );
}

function StarWait({ view, now }: { view: PlayerView; now: number }) {
  const phase =
    view.phase === 'immunity_bid' && view.clock
      ? `puja de los activos (${formatClock(view.clock.deadline, now)})`
      : 'consigna revelada';
  return (
    <>
      <p className="kicker">CONSIGNA DE LA RONDA</p>
      <div className="prompt-soft">
        <p>{view.prompt?.text}</p>
      </div>
      <p className="block">
        <b>Fase actual: {phase}</b>
      </p>
      <p className="lead">No participás de la puja. Vas a ver los nominados y sus discursos, y te avisamos cuando empiece la votación.</p>
      <p className="banner-outline center">
        En la votación vas a recibir <b>{freeTokenLabel(rulesOf(view).freeTokensForFiredVoters)}</b>
      </p>
    </>
  );
}

function activePlayers(view: PlayerView): number {
  return view.players.filter((player) => player.status === 'active').length;
}

function survivorSentence(count: number): string {
  if (count === 1) return 'El nominado con más fichas sobrevive.';
  return `Los ${count} nominados con más fichas sobreviven.`;
}

const NOMINEE_PHASES = new Set<PlayerView['phase']>(['reveal_bid', 'prep', 'speeches', 'facilitator_bonus', 'vote']);

function statusWord(view: PlayerView, me: PlayerInMatch): 'Nominado' | 'Activo' | 'Despedido' {
  if (me.status === 'fired') return 'Despedido';
  if (NOMINEE_PHASES.has(view.phase) && view.nominees.includes(me.email)) return 'Nominado';
  return 'Activo';
}

function Status({ view, me }: { view: PlayerView; me: PlayerInMatch }) {
  return (
    <div className="bar player-status">
      <span className="player-status-name">
        <b>{me.name}</b>
      </span>
      <span>
        Ranking <b>{rankLabel(me.rank ?? me.rankWhenFired)}</b>
      </span>
      <span>
        <b>{me.tokens}</b> fichas
      </span>
      <span>{statusWord(view, me)}</span>
    </div>
  );
}

function awardLine(award: TokenAward, view: PlayerView): string {
  const who = nameOf(view.players, award.survivor);
  if (award.reason === 'survivor_reward') return `Sobreviviste: +${award.amount} fichas`;
  if (award.reason === 'vote_refund') {
    const extra = rulesOf(view).extraTokensForVotingASurvivor;
    const returned = Math.max(0, award.amount - extra);
    return `Votaste a ${who} (sobrevive): recuperás ${tokenLabel(returned)} y ${tokenLabel(extra)} de premio`;
  }
  return `Máximo votante de ${who}: +${award.amount}`;
}

function formatClock(deadline: number, now: number): string {
  const total = Math.max(0, Math.ceil((deadline - now) / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}
