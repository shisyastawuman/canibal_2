import { FacilitatorMatch } from './app/FacilitatorMatch';
import { HistoryPage } from './app/HistoryPage';
import { Home, NewMatch } from './app/Home';
import { PlayerMatch } from './app/PlayerMatch';
import { Prompts } from './app/Prompts';
import { PublicMatch } from './app/PublicMatch';
import { usePath, useSession } from './app/useSession';

export function App() {
  const path = usePath();
  const session = useSession();
  const routed = path.match(/^\/(m|j|p)\/([^/]+)\/?$/);
  const screen =
    routed?.[1] === 'm' && routed[2] ? (
      <FacilitatorMatch code={decodeURIComponent(routed[2])} />
    ) : routed?.[1] === 'j' && routed[2] ? (
      <PlayerMatch code={decodeURIComponent(routed[2])} />
    ) : routed?.[1] === 'p' && routed[2] ? (
      <PublicMatch code={decodeURIComponent(routed[2])} />
    ) : path === '/consignas' ? (
      <Prompts />
    ) : path === '/historial' ? (
      <HistoryPage />
    ) : path === '/nueva' ? (
      <NewMatch />
    ) : (
      <Home />
    );
  return (
    <>
      {session.offline && <p className="panel">Sin conexión con el servidor. Se reintenta solo.</p>}
      {screen}
    </>
  );
}
