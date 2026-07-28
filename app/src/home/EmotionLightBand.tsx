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
      {/* Subtle band-area backdrop so the element reads as "a place" even
          when data is thin. Omitted when empty (no bars, no hairline). */}
      {drawn.length > 0 && (
        <rect
          x={0}
          y={0}
          width={WIDTH}
          height={HEIGHT}
          fill="rgba(0,0,0,0.04)"
          rx={4}
        />
      )}
      {/* Empty samples: reserve layout space only — no hairline. A midline
          flash during thinking→playing felt like a UI bug when switching songs. */}
      {drawn.map((s, i) => {
        const { h, s: sat, l } = padHSL(s);
        // Lower lightness so the color is legible on the light ambient bg,
        // boost saturation for punch. Retain 40-72% lightness range.
        const displayL = Math.max(40, Math.min(72, l * 0.72));
        const displaySat = Math.max(30, Math.min(100, sat + 30));
        const color = `hsl(${h}, ${displaySat}%, ${displayL}%)`;
        const halfBar = Math.max(6, Math.abs(s.p) * (HEIGHT / 2 - 2));
        const y = s.p >= 0 ? MID - halfBar : MID;
        const barH = halfBar;
        // Wider bars for readability — fill ~70% of the column, then modulate
        // by arousal.
        const barW = Math.max(4, columnW * 0.7 + Math.abs(s.a) * 2);
        return (
          <rect
            data-testid={`emotion-band-sample-${i}`}
            key={i}
            x={i * columnW + columnW / 2 - barW / 2}
            y={y}
            width={barW}
            height={barH}
            fill={color}
            rx={1.5}
          />
        );
      })}
    </svg>
  );
}
