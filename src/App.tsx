import { FacilitatorMatch } from './app/FacilitatorMatch';
import { HistoryPage } from './app/HistoryPage';
import { Home, NewMatch } from './app/Home';
import { PlayerMatch } from './app/PlayerMatch';
import { Prompts } from './app/Prompts';
import { PublicMatch } from './app/PublicMatch';
import { usePath } from './app/useSession';

export function App() {
  const path = usePath();
  const routed = path.match(/^\/(m|j|p)\/([^/]+)\/?$/);
  if (routed?.[1] === 'm' && routed[2]) return <FacilitatorMatch code={decodeURIComponent(routed[2])} />;
  if (routed?.[1] === 'j' && routed[2]) return <PlayerMatch code={decodeURIComponent(routed[2])} />;
  if (routed?.[1] === 'p' && routed[2]) return <PublicMatch code={decodeURIComponent(routed[2])} />;
  if (path === '/consignas') return <Prompts />;
  if (path === '/historial') return <HistoryPage />;
  if (path === '/nueva') return <NewMatch />;
  return <Home />;
}
