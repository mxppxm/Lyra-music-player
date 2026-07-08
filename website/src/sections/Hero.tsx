import { forwardRef } from 'react';
import { Constellation } from '../components/Constellation';
import { HeroDesktop } from '../components/HeroDesktop';
import { BottleInput } from '../components/BottleInput';
import { ScrollHint } from '../components/ScrollHint';
import { HERO } from '../copy/ledger';

export const Hero = forwardRef<HTMLElement>((_, ref) => {
  return (
    <section ref={ref} style={{ position: 'relative' }}>
      <Constellation mode="hero" active />
      <HeroDesktop />
      <h1 style={{
        fontSize: 40, margin: '48px 0 8px', fontWeight: 400,
        letterSpacing: '0.02em',
      }}>
        {HERO.bigZh}
      </h1>
      <p style={{
        fontFamily: 'var(--font-serif-italic)', fontStyle: 'italic',
        fontSize: 14, color: 'var(--text-color-soft)', marginBottom: 40,
      }}>
        {HERO.bigEn}
      </p>
      <BottleInput />
      <ScrollHint />
    </section>
  );
});
Hero.displayName = 'Hero';
