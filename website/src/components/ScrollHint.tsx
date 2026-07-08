import { useEffect, useState } from 'react';

export function ScrollHint() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(false), 3000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', bottom: 40, left: 0, right: 0,
        textAlign: 'center', fontSize: 20, color: 'var(--text-color-dim)',
        transition: 'opacity 1s var(--ease-out)',
        opacity: visible ? 1 : 0,
        pointerEvents: 'none',
      }}
    >
      ↓
    </div>
  );
}
