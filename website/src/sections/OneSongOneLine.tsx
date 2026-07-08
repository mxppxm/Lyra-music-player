import { forwardRef } from 'react';
import { CoverMock } from '../components/illust/CoverMock';
import { ONE_SONG_ONE_LINE } from '../copy/ledger';

export const OneSongOneLine = forwardRef<HTMLElement>((_, ref) => (
  <section ref={ref}>
    <div style={{ textAlign: 'center', maxWidth: 640 }}>
      <h2 style={{ fontSize: 32, fontWeight: 400, margin: '0 0 24px' }}>{ONE_SONG_ONE_LINE.title}</h2>
      {ONE_SONG_ONE_LINE.body.map((line, i) => (
        <p key={i} style={{ fontSize: 17, lineHeight: 1.8, margin: 0, color: 'var(--text-color-soft)' }}>
          {line}
        </p>
      ))}
      <div style={{ margin: '48px 0' }}>
        <CoverMock />
      </div>
      {ONE_SONG_ONE_LINE.captions.map((line, i) => (
        <p key={i} style={{
          fontFamily: 'var(--font-serif-italic)', fontStyle: 'italic',
          fontSize: 16, color: 'var(--text-color-soft)', margin: '8px 0',
        }}>
          &ldquo;{line}&rdquo;
        </p>
      ))}
    </div>
  </section>
));
OneSongOneLine.displayName = 'OneSongOneLine';
