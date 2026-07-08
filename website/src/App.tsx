import { useRef, useState } from 'react';
import { AmbientBackground } from './components/AmbientBackground';
import { LyraString } from './components/LyraString';
import { useSectionAmbient } from './hooks/useSectionAmbient';
import { SECTION_COLORS, DARK_SECTIONS } from './theme/ambient';
import { Hero } from './sections/Hero';
import { Listening } from './sections/Listening';
import { OneSongOneLine } from './sections/OneSongOneLine';
import { Memory } from './sections/Memory';
import { Dream } from './sections/Dream';
import { Silence } from './sections/Silence';
import { Growth } from './sections/Growth';
import { Footer } from './sections/Footer';

export default function App() {
  const refs = Array.from({ length: 8 }, () => useRef<HTMLElement>(null));
  const [active, setActive] = useState(0);
  useSectionAmbient(refs, {
    colors: SECTION_COLORS,
    darkSections: DARK_SECTIONS,
    onActiveChange: setActive,
  });

  return (
    <>
      <AmbientBackground />
      <LyraString activeSectionIndex={active} silentSectionIndex={5} />
      <main>
        <Hero ref={refs[0]} />
        <Listening ref={refs[1]} />
        <OneSongOneLine ref={refs[2]} />
        <Memory ref={refs[3]} />
        <Dream ref={refs[4]} active={active === 4} />
        <Silence ref={refs[5]} />
        <Growth ref={refs[6]} />
        <Footer ref={refs[7]} />
      </main>
    </>
  );
}
