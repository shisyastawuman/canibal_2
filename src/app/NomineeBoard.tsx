import { useLayoutEffect, useRef, useState } from 'react';
import { speakingOrder } from '../game';
import type { PublicPlayer, TokenAward, VoteResults } from '../game';
import { nameOf, rankLabel, tokenLabel } from './format';
import { useFlipList } from './useFlipList';
import { usePhaseReveal } from './usePhaseReveal';

type Person = { email: string; name: string; rank: number | null; rankWhenFired?: number | null; tokens: number };

export function SpeakingQueue({
  nominees,
  players,
  bidSpends,
  meEmail,
}: {
  nominees: readonly string[];
  players: readonly Person[];
  bidSpends?: readonly { email: string; spent: number }[] | null;
  meEmail?: string;
}) {
  const order = speakingOrder({ nominees, players, bidSpends });
  return (
    <>
      <p className="block">
        <b>Orden de habla</b>
      </p>
      <ol className="nominee-queue">
        {order.map((email, index) => {
          const player = players.find((item) => item.email === email);
          return (
            <li key={email} className={email === meEmail ? 'you' : undefined}>
              <span>
                {index + 1}. {player?.name ?? email}
                {email === meEmail ? ' (vos)' : ''}
              </span>
              <span className="note">{rankLabel(player?.rank ?? null)}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** Survivors above, fired below. Within each group, higher vote totals stay higher. */
function survivorFirstOrder(results: Pick<VoteResults, 'totals' | 'survivors' | 'fired'>): string[] {
  const rank = new Map(results.totals.map((total, index) => [total.nominee, index]));
  const byVote = (a: string, b: string) => (rank.get(a) ?? Number.POSITIVE_INFINITY) - (rank.get(b) ?? Number.POSITIVE_INFINITY);
  const survivors = [...results.survivors].sort(byVote);
  const fired = [...results.fired].sort(byVote);
  const placed = new Set<string>([...survivors, ...fired]);
  const rest = results.totals.map((total) => total.nominee).filter((email) => !placed.has(email));
  return [...survivors, ...fired, ...rest];
}

function revealIdentity(results: Pick<VoteResults, 'totals' | 'survivors' | 'fired'>): string {
  return `${results.totals.map((total) => `${total.nominee}:${total.total}`).join('|')}::${results.survivors.join(',')}::${results.fired.join(',')}`;
}

/** Reveal-vote animation: reorder once so survivors sit above the fired, then paint those colors. */
export function VoteRevealBoard({
  nominees,
  players,
  bidSpends,
  results,
  meEmail,
}: {
  nominees: readonly string[];
  players: readonly Person[];
  bidSpends?: readonly { email: string; spent: number }[] | null;
  results: Pick<VoteResults, 'totals' | 'survivors' | 'fired'>;
  meEmail?: string;
}) {
  // String identity, not object references. The public screen rebuilds `players` on every clock tick.
  const revealKey = revealIdentity(results);
  const step = usePhaseReveal(true, revealKey);
  const [order, setOrder] = useState(() => speakingOrder({ nominees, players, bidSpends }));
  const flipRef = useFlipList(order.join('|'));
  const speakingRef = useRef(order);
  const resultsRef = useRef(results);
  speakingRef.current = speakingOrder({ nominees, players, bidSpends });
  resultsRef.current = results;

  useLayoutEffect(() => {
    setOrder(speakingRef.current);
  }, [revealKey]);

  useLayoutEffect(() => {
    if (step !== 'reorder') return;
    const outcome = survivorFirstOrder(resultsRef.current);
    // Let the speaking order paint once, then flip survivors to the top and fired to the bottom.
    const frame = requestAnimationFrame(() => setOrder(outcome));
    return () => cancelAnimationFrame(frame);
  }, [step, revealKey]);

  return (
    <>
      <p className="block">
        <b>Nominados</b>
      </p>
      <ul ref={flipRef} className="nominee-queue">
        {order.map((email) => {
          const player = players.find((item) => item.email === email);
          const total = results.totals.find((item) => item.nominee === email);
          const painted = step === 'paint' || step === 'done';
          const cls = [
            email === meEmail ? 'you' : '',
            painted && results.survivors.includes(email) ? 'survivor' : '',
            painted && results.fired.includes(email) ? 'eliminated' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li key={email} data-flip-id={email} className={cls || undefined}>
              <span>
                {player?.name ?? email}
                {email === meEmail ? ' (vos)' : ''}
              </span>
              <span>
                {rankLabel(player?.rank ?? player?.rankWhenFired ?? null)}
                {total ? ` · ${total.total}` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function RewardsBoard({
  results,
  players,
  meEmail,
}: {
  results: {
    survivors: readonly string[];
    fired: readonly string[];
    awards: readonly TokenAward[];
  };
  players: readonly PublicPlayer[] | readonly Person[];
  meEmail?: string;
}) {
  const survivors = results.survivors;
  const fired = results.fired;
  return (
    <div className="nominee-split">
      <div>
        <h3>Sobreviven</h3>
        <ul className="nominee-queue">
          {survivors.map((email) => {
            const player = players.find((item) => item.email === email);
            const awards = results.awards.filter((award) => award.email === email).reduce((sum, award) => sum + award.amount, 0);
            return (
              <li key={email} className={`survivor${email === meEmail ? ' you' : ''}`}>
                <span>{nameOf(players, email)}</span>
                <span>
                  {rankLabel(player?.rank ?? null)} · {tokenLabel(player?.tokens ?? 0)}
                  {awards > 0 ? ` · +${awards}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <h3>Despedidos</h3>
        <ul className="nominee-queue">
          {fired.map((email) => {
            const player = players.find((item) => item.email === email);
            return (
              <li key={email} className={`eliminated${email === meEmail ? ' you' : ''}`}>
                <span>{nameOf(players, email)}</span>
                <span>
                  {rankLabel(null)} · {tokenLabel(player?.tokens ?? 0)}
                  {player && 'rankWhenFired' in player && player.rankWhenFired != null
                    ? ` · era ${rankLabel(player.rankWhenFired)}`
                    : ''}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
