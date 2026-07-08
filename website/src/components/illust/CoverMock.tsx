import { WatercolorCover } from './WatercolorCover';

export function CoverMock() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <WatercolorCover index={0} />
      <div style={{
        width: 400, height: 12,
        background: 'linear-gradient(90deg, transparent, #f5c76a, #7c8ff0, transparent)',
        opacity: 0.4, borderRadius: 6,
      }} />
    </div>
  );
}
