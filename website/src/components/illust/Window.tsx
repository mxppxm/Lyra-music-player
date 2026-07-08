export function Window() {
  return (
    <svg viewBox="0 0 200 260" width="200" height="260" style={{ opacity: 0.9 }}>
      <rect x="30" y="30" width="140" height="180" fill="none"
            stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
      <line x1="100" y1="30" x2="100" y2="210" stroke="currentColor" strokeWidth="0.4" opacity="0.5" />
      <line x1="30" y1="120" x2="170" y2="120" stroke="currentColor" strokeWidth="0.4" opacity="0.5" />
      <line x1="20" y1="215" x2="180" y2="215" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      <circle cx="50" cy="240" r="6" fill="#f5c76a" opacity="0.8" />
      <circle cx="50" cy="240" r="16" fill="#f5c76a" opacity="0.15" />
      <path d="M 100 30 L 60 210 L 140 210 Z" fill="#f5c76a" opacity="0.08" />
    </svg>
  );
}
