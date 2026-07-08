import { forwardRef } from 'react';
import { PRIVACY } from '../copy/ledger';

export const Privacy = forwardRef<HTMLElement>((_, ref) => (
  <section ref={ref}>
    <div style={{ textAlign: 'center', maxWidth: 640 }}>
      <h2 style={{ fontSize: 32, fontWeight: 400, margin: '0 0 32px' }}>{PRIVACY.title}</h2>
      {PRIVACY.body.map((line, i) => (
        <p key={i} style={{
          fontSize: 17, lineHeight: 1.9, margin: '4px 0', color: 'var(--text-color-soft)',
        }}>
          {line}
        </p>
      ))}
    </div>
  </section>
));
Privacy.displayName = 'Privacy';
