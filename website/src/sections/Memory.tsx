import { forwardRef } from 'react';
import { MemoryFile } from '../components/illust/MemoryFile';
import { MEMORY, FOOTER } from '../copy/ledger';

export const Memory = forwardRef<HTMLElement>((_, ref) => (
  <section ref={ref}>
    <div style={{
      display: 'flex', flexDirection: 'row', gap: 60, alignItems: 'center',
      maxWidth: 1000, flexWrap: 'wrap', justifyContent: 'center',
    }}>
      <MemoryFile />
      <div style={{ maxWidth: 380 }}>
        <h2 style={{ fontSize: 32, fontWeight: 400, margin: '0 0 24px' }}>{MEMORY.title}</h2>
        {MEMORY.body.map((line, i) => (
          <p key={i} style={{ fontSize: 17, lineHeight: 1.8, margin: 0, color: 'var(--text-color-soft)' }}>
            {line}
          </p>
        ))}
        <a
          href={`${FOOTER.githubUrl}/blob/main/docs/superpowers/samples/memory.md`}
          target="_blank" rel="noopener noreferrer"
          style={{
            display: 'inline-block', marginTop: 24,
            fontSize: 14, color: 'var(--text-color-dim)',
            textDecoration: 'none', borderBottom: '1px dashed currentColor',
          }}
        >
          {MEMORY.sampleLink}
        </a>
      </div>
    </div>
  </section>
));
Memory.displayName = 'Memory';
