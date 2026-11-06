import { useEffect, useState } from 'react';

export type RevealStep = 'idle' | 'reorder' | 'paint' | 'done';

/** Timed steps for reveal_vote center animation. Resets when `key` changes. */
export function usePhaseReveal(active: boolean, key: string): RevealStep {
  const [step, setStep] = useState<RevealStep>('idle');

  useEffect(() => {
    if (!active) {
      setStep('idle');
      return;
    }
    setStep('reorder');
    const paint = window.setTimeout(() => setStep('paint'), 700);
    const done = window.setTimeout(() => setStep('done'), 1400);
    return () => {
      window.clearTimeout(paint);
      window.clearTimeout(done);
    };
  }, [active, key]);

  return step;
}
