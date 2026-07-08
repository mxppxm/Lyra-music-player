import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface Props {
  activeSectionIndex: number;
  silentSectionIndex: number;
}

export function LyraString({ activeSectionIndex, silentSectionIndex }: Props) {
  const pathRef = useRef<SVGPathElement>(null);
  const amplitudeRef = useRef(0);
  const phaseRef = useRef(0);
  const silentUntilRef = useRef(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (activeSectionIndex === silentSectionIndex) {
      silentUntilRef.current = performance.now() + 8000;
      amplitudeRef.current = 0;
    }
  }, [activeSectionIndex, silentSectionIndex]);

  useEffect(() => {
    if (reduced) return;

    const bumpAmplitude = (delta: number) => {
      if (performance.now() < silentUntilRef.current) return;
      amplitudeRef.current = Math.min(amplitudeRef.current + delta, 8);
    };
    const onMouseMove = (e: MouseEvent) => bumpAmplitude(Math.hypot(e.movementX, e.movementY) / 10);
    let lastScrollY = window.scrollY;
    const onScroll = () => {
      const delta = Math.abs(window.scrollY - lastScrollY);
      lastScrollY = window.scrollY;
      bumpAmplitude(delta / 20);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('scroll', onScroll, { passive: true });

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const silent = now < silentUntilRef.current;
      phaseRef.current += 0.03;
      if (!silent) amplitudeRef.current *= 0.99;
      if (amplitudeRef.current < 0.05) amplitudeRef.current = 0;

      const path = pathRef.current;
      if (path) {
        const h = window.innerHeight;
        const x0 = window.innerWidth / 2;
        const points: string[] = [];
        const segments = 30;
        for (let i = 0; i <= segments; i++) {
          const y = (h / segments) * i;
          const wave = silent ? 0 : Math.sin(phaseRef.current + i * 0.4) * amplitudeRef.current;
          points.push(`${i === 0 ? 'M' : 'L'} ${x0 + wave} ${y}`);
        }
        path.setAttribute('d', points.join(' '));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('scroll', onScroll);
    };
  }, [reduced]);

  return (
    <svg
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, width: '100vw', height: '100vh',
        pointerEvents: 'none', zIndex: -1,
      }}
    >
      <defs>
        <linearGradient id="lyraGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5c76a" />
          <stop offset="100%" stopColor="#7c8ff0" />
        </linearGradient>
      </defs>
      <path
        ref={pathRef}
        stroke="url(#lyraGradient)"
        strokeWidth="1"
        fill="none"
        opacity="0.4"
      />
    </svg>
  );
}
