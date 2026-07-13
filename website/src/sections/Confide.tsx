import { forwardRef } from 'react';
import { CONFIDE } from '../copy/ledger';

export const Confide = forwardRef<HTMLElement>((_, ref) => (
  <section ref={ref} style={{ position: 'relative', overflow: 'hidden' }}>
    <svg
      aria-hidden="true"
      viewBox="0 0 800 600"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.22 }}
    >
      <defs>
        <radialGradient id="confideBreak" cx="50%" cy="60%" r="55%">
          <stop offset="0%" stopColor="#f5c76a" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#e0955f" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#e0955f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="400" cy="360" r="220" fill="url(#confideBreak)" />
      <path d="M 240 360 L 560 360" stroke="#e0955f" strokeWidth="0.6" opacity="0.5" />
      <path d="M 280 300 L 520 420" stroke="#e0955f" strokeWidth="0.4" opacity="0.35" />
      <path d="M 280 420 L 520 300" stroke="#e0955f" strokeWidth="0.4" opacity="0.35" />
    </svg>
    <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 640 }}>
      <h2 style={{ fontSize: 32, fontWeight: 400, margin: '0 0 32px' }}>{CONFIDE.title}</h2>
      {CONFIDE.body.map((line, i) => (
        <p key={i} style={{
          fontSize: 17, lineHeight: 1.9, margin: '4px 0', color: 'var(--text-color-soft)',
        }}>
          {line}
        </p>
      ))}
    </div>
  </section>
));
Confide.displayName = 'Confide';
