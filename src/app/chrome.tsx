import type { ReactNode } from 'react';
import { navigate } from './useSession';

export function Link({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={to}
      className={className ?? ''}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function Header({ chip }: { chip: string }) {
  return (
    <div className="top">
      <span className="brand">Caníbal</span>
      <span className="chip">{chip}</span>
    </div>
  );
}

export function Missing() {
  return (
    <>
      <h1>Caníbal</h1>
      <p className="lead">No existe esa partida.</p>
      <Link to="/" className="btn">
        Volver al inicio
      </Link>
    </>
  );
}

export function ClockRead({ deadline, now, caption }: { deadline: number; now: number; caption: string }) {
  const remaining = Math.max(0, deadline - now);
  const total = Math.ceil(remaining / 1000);
  const text = `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
  return (
    <>
      <p className="clock">{text}</p>
      <p className="clock-caption">{caption}</p>
    </>
  );
}

export function Stepper({
  value,
  decLabel,
  incLabel,
  onDec,
  onInc,
}: {
  value: number;
  decLabel: string;
  incLabel: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="stepper">
      <button type="button" className="btn-round" aria-label={decLabel} onClick={onDec} disabled={value <= 0}>
        −
      </button>
      <span className="stepper-value">{value}</span>
      <button type="button" className="btn-round" aria-label={incLabel} onClick={onInc}>
        +
      </button>
    </div>
  );
}
