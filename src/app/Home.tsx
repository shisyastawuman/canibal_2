import { useState } from 'react';
import { createNewMatch } from '../session';
import { Link } from './chrome';
import { errorText } from './format';
import { navigate, useSession } from './useSession';

export function Home() {
  const session = useSession();
  const open = Object.values(session.matches).filter((match) => match.phase !== 'victory');
  return (
    <>
      <h1>Caníbal</h1>
      <p className="subtitle">Capacitación · Partida en vivo</p>
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
                {` · ${match.players.length} jugadores`}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export function NewMatch() {
  const session = useSession();
  const [order, setOrder] = useState(() => session.prompts.map((prompt) => prompt.id));
  const [picked, setPicked] = useState(() => new Set(session.prompts.map((prompt) => prompt.id)));
  const [error, setError] = useState('');

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

  function create() {
    const result = createNewMatch(order.filter((id) => picked.has(id)));
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    navigate(`/m/${result.code}`);
  }

  return (
    <>
      <h1>Nueva partida</h1>
      <p className="lead">
        El orden de esta lista es el de las rondas. Hacen falta al menos tantas consignas como rondas: 5 con 7 jugadores
        y 7 con 9 o más.
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
              <span>{prompt.text}</span>
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
        <button type="button" className="btn" onClick={create} disabled={picked.size === 0}>
          Crear partida
        </button>
        <Link to="/" className="btn secondary">
          Volver
        </Link>
      </div>
    </>
  );
}
