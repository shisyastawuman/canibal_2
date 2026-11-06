import { rankLabel, rosterRowWash, tokenBounds } from './format';
import { parseDeltaLabel } from './rosterDeltas';
import { useFlipList } from './useFlipList';

export type RosterPlayer = {
  email: string;
  name: string;
  status: 'active' | 'fired';
  rank: number | null;
  tokens: number;
};

export function ActivePlayersList({
  players,
  highlightEmail,
  deltaByEmail,
  highlightEmails,
}: {
  players: readonly RosterPlayer[];
  highlightEmail?: string | undefined;
  deltaByEmail?: Record<string, string> | undefined;
  highlightEmails?: ReadonlySet<string> | readonly string[] | undefined;
}) {
  const highlighted = highlightEmails instanceof Set ? highlightEmails : new Set(highlightEmails ?? []);
  const showDelta = Boolean(deltaByEmail && Object.keys(deltaByEmail).length > 0);
  const active = players
    .filter((player) => player.status === 'active')
    .map((player) => {
      const delta = deltaByEmail?.[player.email];
      return {
        player,
        delta,
        tokens: player.tokens + parseDeltaLabel(delta),
      };
    })
    .sort((a, b) => (a.player.rank ?? 0) - (b.player.rank ?? 0));
  const { least, most } = tokenBounds(active.map((row) => row.tokens));
  const flipKey = active.map((row) => `${row.player.email}:${row.player.rank}:${row.tokens}`).join('|');
  const listRef = useFlipList(flipKey);

  if (active.length === 0) {
    return <p className="panel">No hay jugadores activos.</p>;
  }

  return (
    <ul ref={listRef} className={`roster-list roster-list-active${showDelta ? ' roster-list-delta' : ''}`}>
      <li className="roster-head" aria-hidden="true">
        <span className="roster-rank">Rank</span>
        <span className="roster-name">Nombre</span>
        <span className="roster-tokens">Fichas</span>
        {showDelta && <span className="roster-delta">Δ</span>}
      </li>
      {active.map(({ player, delta, tokens }) => {
        const wash = rosterRowWash(tokens, least, most);
        const classes = [
          player.email === highlightEmail ? 'you' : '',
          highlighted.has(player.email) ? 'roster-nominee' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <li
            key={player.email}
            data-flip-id={player.email}
            className={classes || undefined}
            style={wash && !highlighted.has(player.email) ? { backgroundColor: wash } : undefined}
          >
            <span className="roster-rank">{rankLabel(player.rank)}</span>
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
