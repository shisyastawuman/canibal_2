import type { RosterPlayer } from './ActivePlayersList';
import { rosterRowWash, tokenBounds } from './format';
import { parseDeltaLabel } from './rosterDeltas';
import { useFlipList } from './useFlipList';

export function FiredPlayersList({
  players,
  highlightEmail,
  deltaByEmail,
}: {
  players: readonly RosterPlayer[];
  highlightEmail?: string | undefined;
  deltaByEmail?: Record<string, string> | undefined;
}) {
  const showDelta = Boolean(deltaByEmail && Object.keys(deltaByEmail).length > 0);
  const fired = players
    .filter((player) => player.status === 'fired')
    .map((player) => {
      const delta = deltaByEmail?.[player.email];
      return {
        player,
        delta,
        tokens: player.tokens + parseDeltaLabel(delta),
      };
    })
    .sort((a, b) => b.tokens - a.tokens || a.player.name.localeCompare(b.player.name));
  const { least, most } = tokenBounds(fired.map((row) => row.tokens));
  const flipKey = fired.map((row) => `${row.player.email}:${row.tokens}`).join('|');
  const listRef = useFlipList(flipKey);

  if (fired.length === 0) {
    return <p className="panel">Todavía no hay despedidos.</p>;
  }

  return (
    <ul ref={listRef} className={`roster-list roster-list-fired${showDelta ? ' roster-list-delta' : ''}`}>
      <li className="roster-head" aria-hidden="true">
        <span className="roster-name">Nombre</span>
        <span className="roster-tokens">Fichas</span>
        {showDelta && <span className="roster-delta">Δ</span>}
      </li>
      {fired.map(({ player, delta, tokens }) => {
        const wash = rosterRowWash(tokens, least, most);
        return (
          <li
            key={player.email}
            data-flip-id={player.email}
            className={player.email === highlightEmail ? 'you' : undefined}
            style={wash ? { backgroundColor: wash } : undefined}
          >
            <span className="roster-name" title={player.name}>
              {player.name}
            </span>
            <b className="roster-tokens">{tokens}</b>
            {showDelta && <span className="roster-delta">{delta ?? ''}</span>}
          </li>
        );
      })}
    </ul>
  );
}
