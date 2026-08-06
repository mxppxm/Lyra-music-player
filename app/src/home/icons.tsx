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

/** 静谧的涟漪 —— 报错/未得回响时的克制示意，取「静」之象。 */
export function IconRipple({ size = 26, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="1.4" fill="currentColor" opacity="0.9" />
      <ellipse
        cx="12"
        cy="12"
        rx="6"
        ry="2.4"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.55"
      />
      <ellipse
        cx="12"
        cy="12"
        rx="9.4"
        ry="3.6"
        stroke="currentColor"
        strokeWidth="1.1"
        opacity="0.3"
      />
    </svg>
  );
}

export function IconHistory({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 8v4l2.5 1.5M12 5a7 7 0 1 0 7 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 5V3M12 3h-2M12 3h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
