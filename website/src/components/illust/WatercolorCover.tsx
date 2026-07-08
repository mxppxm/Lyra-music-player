interface Props { index: 0 | 1; }

const PALETTES: [string, string, string][] = [
  ['#f5c76a', '#fef3d7', '#c9d4f5'],
  ['#7c8ff0', '#f0efeb', '#c3d9c4'],
];

export function WatercolorCover({ index }: Props) {
  const [c1, c2, c3] = PALETTES[index];
  const gid = `blur-heavy-${index}`;
  return (
    <svg
      viewBox="0 0 400 400"
      width="400"
      height="400"
      style={{
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        background: c2,
      }}
    >
      <defs>
        <filter id={gid} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="30" />
        </filter>
      </defs>
      <g filter={`url(#${gid})`} opacity="0.7">
        <circle cx="120" cy="140" r="120" fill={c1} />
        <circle cx="280" cy="220" r="150" fill={c3} />
        <circle cx="200" cy="320" r="100" fill={c1} opacity="0.5" />
      </g>
    </svg>
  );
}
