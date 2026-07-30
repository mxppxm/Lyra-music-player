type IconProps = { size?: number; className?: string };

export function IconPrev({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M6 6v12M6 12l9-6v12l-9-6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function IconNext({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M18 6v12M9 6l9 6-9 6V6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPlay({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M9 7.2v9.6c0 .6.65.97 1.15.67l7.8-4.8c.46-.28.46-.96 0-1.24l-7.8-4.8A.85.85 0 0 0 9 7.2z" fill="currentColor" />
    </svg>
  );
}

export function IconPause({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="7" y="6" width="3.2" height="12" rx="1" fill="currentColor" />
      <rect x="13.8" y="6" width="3.2" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}
