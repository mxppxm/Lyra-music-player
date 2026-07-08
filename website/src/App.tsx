import { useRef, useState } from 'react';
import { AmbientBackground } from './components/AmbientBackground';
import { LyraString } from './components/LyraString';
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
        {titles.map((t, i) => (
          <section key={i} ref={refs[i]}>
            <h2 style={{ fontSize: 32, fontWeight: 400 }}>{t}</h2>
          </section>
        ))}
      </main>
    </>
  );
}
