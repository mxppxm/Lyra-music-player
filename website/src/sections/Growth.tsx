import { forwardRef } from 'react';
import { GROWTH } from '../copy/ledger';

export const Growth = forwardRef<HTMLElement>((_, ref) => (
  <section ref={ref} style={{ position: 'relative', overflow: 'hidden' }}>
    <svg
      aria-hidden="true"
      viewBox="0 0 800 600"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.3 }}
    >
      <defs>
        <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5c76a" />
          <stop offset="100%" stopColor="#7c8ff0" />
        </linearGradient>
      </defs>
      <path d="M 380 0 Q 400 300 380 600" stroke="url(#growthGrad)" strokeWidth="1" fill="none" />
      <path d="M 420 0 Q 400 300 420 600" stroke="url(#growthGrad)" strokeWidth="1" fill="none" opacity="0.6" />
    </svg>
    <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 640 }}>
      <h2 style={{ fontSize: 32, fontWeight: 400, margin: '0 0 32px' }}>{GROWTH.title}</h2>
      {GROWTH.body.map((line, i) => (
        <p key={i} style={{
          fontSize: 17, lineHeight: 1.9, margin: '4px 0', color: 'var(--text-color-soft)',
        }}>
          {line}
        </p>
      ))}
    </div>
  </section>
));
Growth.displayName = 'Growth';
