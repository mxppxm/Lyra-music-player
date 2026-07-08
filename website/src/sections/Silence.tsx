import { forwardRef } from 'react';
import { SILENCE } from '../copy/ledger';

export const Silence = forwardRef<HTMLElement>((_, ref) => (
  <section ref={ref}>
    <div style={{ textAlign: 'center', maxWidth: 640 }}>
      <h2 style={{ fontSize: 32, fontWeight: 400, margin: '0 0 32px' }}>{SILENCE.title}</h2>
      {SILENCE.body.map((line, i) => (
        <p key={i} style={{
          fontSize: 17, lineHeight: 1.9, margin: '4px 0', color: 'var(--text-color-soft)',
        }}>
          {line}
        </p>
      ))}
    </div>
  </section>
));
Silence.displayName = 'Silence';
