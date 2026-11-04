import { useState } from 'react';
import { createPrompt, editPrompt, removePrompt } from '../session';
import { Link } from './chrome';
import { useSession } from './useSession';

export function Prompts() {
  const session = useSession();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState('');
  if (!session.ready) return <p className="panel">Cargando…</p>;

  return (
    <>
      <h1>Consignas</h1>
      <p className="lead">La base de consignas de la capacitación. Cada partida usa una lista ordenada de estas.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void createPrompt(draft).then((result) => {
            if (!result.ok) {
              setError(result.error === 'offline' ? 'No hay conexión. Probá de nuevo en un momento.' : 'Escribí el texto de la consigna.');
              return;
            }
            setDraft('');
            setError('');
          });
        }}
      >
        <label className="field" htmlFor="nueva">
          Nueva consigna
        </label>
        <textarea id="nueva" value={draft} onChange={(event) => setDraft(event.target.value)} />
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn">
          Agregar
        </button>
      </form>
      {session.prompts.map((prompt) => (
        <div key={prompt.id} className="prompt-row">
          {editing === prompt.id ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void editPrompt(prompt.id, editText).then((result) => {
                  if (!result.ok) {
                    setError(result.error === 'offline' ? 'No hay conexión. Probá de nuevo en un momento.' : 'Escribí el texto de la consigna.');
                    return;
                  }
                  setEditing(null);
                  setError('');
                });
              }}
            >
              <textarea value={editText} onChange={(event) => setEditText(event.target.value)} />
              <div className="row-actions">
                <button type="submit" className="btn">
                  Guardar
                </button>
                <button type="button" className="btn secondary" onClick={() => setEditing(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <>
              <p className="block">{prompt.text}</p>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setEditing(prompt.id);
                    setEditText(prompt.text);
                  }}
                >
                  Modificar
                </button>
                <button type="button" className="btn secondary" onClick={() => void removePrompt(prompt.id)}>
                  Eliminar
                </button>
              </div>
            </>
          )}
        </div>
      ))}
      <div className="actions">
        <Link to="/" className="btn secondary">
          Volver
        </Link>
      </div>
    </>
  );
}
