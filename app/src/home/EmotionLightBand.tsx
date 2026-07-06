import { padHSL, type PAD } from "../lib/color";

const WIDTH = 400;
const HEIGHT = 32;
const MID = HEIGHT / 2;
const MAX_SAMPLES = 20;

export type EmotionLightBandProps = {
  samples: PAD[];
};

export function EmotionLightBand({ samples }: EmotionLightBandProps) {
  const drawn = samples.slice(-MAX_SAMPLES);
  const columnW = WIDTH / MAX_SAMPLES;

  return (
    <svg
      data-testid="emotion-light-band"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{
        width: "var(--lyra-band-width)",
        height: "var(--lyra-band-height)",
        display: "block",
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {drawn.length === 0 ? (
        <line
          data-testid="emotion-band-hairline"
          x1={0}
          y1={MID}
          x2={WIDTH}
          y2={MID}
          stroke="rgba(0,0,0,0.15)"
          strokeWidth={1}
        />
      ) : (
        drawn.map((s, i) => {
          const { h, s: sat, l } = padHSL(s);
          const color = `hsl(${h}, ${Math.max(0, Math.min(100, sat + 10))}%, ${l}%)`;
          const halfBar = Math.max(2, Math.abs(s.p) * (HEIGHT / 2));
          const y = s.p >= 0 ? MID - halfBar : MID;
          const barH = halfBar;
          const stroke = 1 + Math.abs(s.a) * 2;
          return (
            <rect
              data-testid={`emotion-band-sample-${i}`}
              key={i}
              x={i * columnW + columnW / 2 - stroke / 2}
              y={y}
              width={stroke}
              height={barH}
              fill={color}
              rx={1}
            />
          );
        })
      )}
    </svg>
  );
}
