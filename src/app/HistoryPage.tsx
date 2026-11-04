import { useState } from 'react';
import type { HistoryEntry } from '../session';
import { Link, PlayerName } from './chrome';
import { tokenBounds, tokenLabel } from './format';
import { useSession } from './useSession';

export function HistoryPage() {
  const session = useSession();
  const [note, setNote] = useState('');
  if (!session.ready) return <p className="panel">Cargando…</p>;
  return (
    <>
      <h1>Historial</h1>
      <p className="lead">Partidas terminadas. El informe para descargar todavía es un lugar reservado.</p>
      {session.history.length === 0 && <p className="panel">Todavía no hay partidas terminadas.</p>}
      {session.history.map((entry) => (
        <div key={entry.code} className="prompt-row">
          <p className="block">
            <b>{entry.code}</b>
            {` · ${new Date(entry.finishedAt).toLocaleString('es-AR')} · ${entry.rosterSize} jugadores`}
          </p>
          <Winners winners={entry.winners} />
          <button type="button" className="btn secondary" onClick={() => setNote('El informe de la partida todavía no está disponible.')}>
            Descargar informe
          </button>
        </div>
      ))}
      {note && <p className="note section">{note}</p>}
      <div className="actions">
        <Link to="/" className="btn secondary">
          Volver
        </Link>
      </div>
    </>
  );
}

function Winners({ winners }: { winners: HistoryEntry['winners'] }) {
  const { least, most } = tokenBounds(winners.map((winner) => winner.tokens));
  return (
    <ul className="people">
      {winners.map((winner) => (
        <li key={winner.email}>
          <PlayerName name={winner.name} tokens={winner.tokens} least={least} most={most} />
          {winner.kind === 'active'
            ? ` · Activo${winner.rank === null ? '' : ` #${winner.rank}`} · ${tokenLabel(winner.tokens)}`
            : ` · Despedido · ${tokenLabel(winner.tokens)}`}
        </li>
      ))}
    </ul>
  );
}
