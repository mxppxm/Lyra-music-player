import { useEffect, useState } from 'react';
import { WatercolorCover } from './illust/WatercolorCover';
import { HERO } from '../copy/ledger';
import { useReducedMotion } from '../hooks/useReducedMotion';

export function HeroDesktop() {
  const [phase, setPhase] = useState<0 | 1>(0);
  const [visible, setVisible] = useState(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const cycle = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setPhase((p) => (p === 0 ? 1 : 0));
        setVisible(true);
      }, 500);
    }, 4000);
    return () => window.clearInterval(cycle);
  }, [reduced]);

  const caption = phase === 0 ? HERO.demoCaptionA : HERO.demoCaptionB;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
      transition: 'opacity 600ms var(--ease-out)',
      opacity: visible ? 1 : 0,
    }}>
      <WatercolorCover index={phase} />
      <div style={{
        fontFamily: 'var(--font-serif-italic)', fontStyle: 'italic',
        fontSize: 16, color: 'var(--text-color-soft)',
      }}>
        {caption}
      </div>
    </div>
  );
}
