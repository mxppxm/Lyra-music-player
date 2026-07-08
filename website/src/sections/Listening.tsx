import { forwardRef } from 'react';
import { Window } from '../components/illust/Window';
import { LISTENING } from '../copy/ledger';

export const Listening = forwardRef<HTMLElement>((_, ref) => (
  <section ref={ref}>
    <div style={{
      display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 80,
      maxWidth: 900, flexWrap: 'wrap', justifyContent: 'center',
    }}>
      <Window />
      <div>
        <h2 style={{ fontSize: 32, fontWeight: 400, margin: '0 0 24px' }}>{LISTENING.title}</h2>
        {LISTENING.body.map((line, i) => (
          <p key={i} style={{ fontSize: 17, lineHeight: 1.8, margin: 0, color: 'var(--text-color-soft)' }}>
            {line}
          </p>
        ))}
      </div>
    </div>
  </section>
));
Listening.displayName = 'Listening';
