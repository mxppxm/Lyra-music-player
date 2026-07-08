import { forwardRef } from 'react';
import { Constellation } from '../components/Constellation';
import { DREAM } from '../copy/ledger';

interface Props { active: boolean; }

export const Dream = forwardRef<HTMLElement, Props>(({ active }, ref) => (
  <section ref={ref} style={{ position: 'relative' }}>
    <Constellation mode="fullscreen" active={active} />
    <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 640 }}>
      <h2 style={{ fontSize: 32, fontWeight: 400, margin: '0 0 32px' }}>{DREAM.title}</h2>
      {DREAM.body.map((line, i) => (
        <p key={i} style={{
          fontSize: 17, lineHeight: 1.9, margin: '4px 0', color: 'var(--text-color-soft)',
        }}>
          {line}
        </p>
      ))}
    </div>
  </section>
));
Dream.displayName = 'Dream';
