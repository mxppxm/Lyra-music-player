import { useRef, useState } from 'react';
import { AmbientBackground } from './components/AmbientBackground';
import { LyraString } from './components/LyraString';
import { Constellation } from './components/Constellation';
import { useSectionAmbient } from './hooks/useSectionAmbient';
import { SECTION_COLORS, DARK_SECTIONS } from './theme/ambient';
import {
  HERO, LISTENING, ONE_SONG_ONE_LINE, MEMORY,
  DREAM, SILENCE, GROWTH, FOOTER,
} from './copy/ledger';

export default function App() {
  const refs = Array.from({ length: 8 }, () => useRef<HTMLElement>(null));
  const [active, setActive] = useState(0);
  useSectionAmbient(refs, {
    colors: SECTION_COLORS,
    darkSections: DARK_SECTIONS,
    onActiveChange: setActive,
  });

  const titles = [
    HERO.bigZh, LISTENING.title, ONE_SONG_ONE_LINE.title, MEMORY.title,
    DREAM.title, SILENCE.title, GROWTH.title, FOOTER.tagline,
  ];

  return (
    <>
      <AmbientBackground />
      <LyraString activeSectionIndex={active} silentSectionIndex={5} />
      <main>
        {titles.map((t, i) => {
          const inner = <h2 style={{ fontSize: 32, fontWeight: 400 }}>{t}</h2>;
          if (i === 0) {
            return (
              <section key={i} ref={refs[i]} style={{ position: 'relative' }}>
                <Constellation mode="hero" active />
                {inner}
              </section>
            );
          }
          if (i === 4) {
            return (
              <section key={i} ref={refs[i]} style={{ position: 'relative' }}>
                <Constellation mode="fullscreen" active={active === 4} />
                {inner}
              </section>
            );
          }
          return (
            <section key={i} ref={refs[i]}>
              {inner}
            </section>
          );
        })}
      </main>
    </>
  );
}
