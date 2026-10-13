import { useState } from 'react';
import { Link } from './chrome';
import { useSession } from './useSession';

export function HistoryPage() {
  const session = useSession();
  const [note, setNote] = useState('');
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
          <ul className="people">
            {entry.winners.map((winner) => (
              <li key={winner.email}>
                {winner.name}
                {winner.kind === 'active' ? ` · Activo ${winner.rank === null ? '' : `#${winner.rank}`}` : ` · Votante estrella · ${winner.tokens} fichas`}
              </li>
            ))}
          </ul>
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
