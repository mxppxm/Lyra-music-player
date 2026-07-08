import { useEffect, useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface Props {
  mode: 'hero' | 'fullscreen';
  active: boolean;
}

const STARS = [
  { name: 'Vega',     cx: 50, cy: 30, r: 1.4, delay: 0 },
  { name: 'Sulafat',  cx: 30, cy: 65, r: 1.0, delay: 1.2 },
  { name: 'Sheliak',  cx: 55, cy: 60, r: 1.0, delay: 2.4 },
  { name: 'epsilon',  cx: 75, cy: 40, r: 0.9, delay: 3.6 },
  { name: 'zeta',     cx: 72, cy: 55, r: 0.9, delay: 4.8 },
];

const LINES: [string, string][] = [
  ['Vega', 'Sulafat'], ['Vega', 'epsilon'],
  ['Sulafat', 'Sheliak'], ['Sheliak', 'zeta'], ['zeta', 'epsilon'],
];

export function Constellation({ mode, active }: Props) {
  const reduced = useReducedMotion();
  const [meteor, setMeteor] = useState(false);

  useEffect(() => {
    if (mode !== 'fullscreen' || !active || reduced) return;
    setMeteor(false);
    const t = setTimeout(() => setMeteor(true), 2000);
    return () => clearTimeout(t);
  }, [mode, active, reduced]);

  const isHero = mode === 'hero';
  const size = isHero ? '20vw' : '60vw';
  const opacity = isHero ? 0.15 : 0.8;
  const position: React.CSSProperties = isHero
    ? { position: 'absolute', top: 40, right: 40, width: size, height: size }
    : { position: 'absolute', inset: 0, margin: 'auto', width: size, height: size };

  const byName = Object.fromEntries(STARS.map((s) => [s.name, s]));

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      style={{ ...position, opacity, pointerEvents: 'none' }}
    >
      <g stroke="currentColor" strokeWidth="0.2" opacity="0.4" fill="none">
        {LINES.map(([a, b], i) => (
          <line key={i} x1={byName[a].cx} y1={byName[a].cy} x2={byName[b].cx} y2={byName[b].cy} />
        ))}
      </g>
      {STARS.map((s) => (
        <circle
          key={s.name}
          cx={s.cx}
          cy={s.cy}
          r={s.r}
          fill="currentColor"
          style={reduced ? { opacity: 1 } : {
            opacity: 0.05,
            animation: `lyra-breath 6s ${s.delay}s ease-in-out infinite`,
          }}
        />
      ))}
      {meteor && (
        <circle
          cx={72}
          cy={55}
          r={0.9}
          fill="#f5c76a"
          style={{ animation: 'lyra-meteor 3s ease-in 1 forwards' }}
        />
      )}
      <style>{`
        @keyframes lyra-breath {
          0%, 100% { opacity: 0.05; }
          50% { opacity: 1; }
        }
        @keyframes lyra-meteor {
          0% { transform: translate(0, 0); opacity: 1; }
          100% { transform: translate(-20px, 50px); opacity: 0; }
        }
      `}</style>
    </svg>
  );
}
