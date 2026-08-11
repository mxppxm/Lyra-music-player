export function IconPlay() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function IconPause() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

export function IconNext() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
    </svg>
  );
}

export function IconPrev() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 18l-8.5-6L18 6v12zM8 6v12H6V6h2z" />
    </svg>
  );
}

export function IconHistory({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function IconShare({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51l6.83 3.98" />
      <path d="M15.41 6.51l-6.82 3.98" />
    </svg>
  );
}

/** Outline / filled heart for favorites — fill fades in so the icon never pops. */
export function IconFavorite({
  size = 20,
  filled = false,
}: {
  size?: number;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={
        filled
          ? "lyra-icon-favorite lyra-icon-favorite--on"
          : "lyra-icon-favorite"
      }
    >
      <path
        className="lyra-icon-favorite__fill"
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        fill="currentColor"
        stroke="none"
      />
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

/** Padlock — open when unlocked, closed when locked. */
export function IconTrackLock({
  size = 20,
  active = false,
}: {
  size?: number;
  active?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={
        active ? "lyra-icon-track-lock lyra-icon-track-lock--on" : "lyra-icon-track-lock"
      }
    >
      <rect
        x="5"
        y="11"
        width="14"
        height="10"
        rx="2"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
      />
      {active ? (
        /* Closed shackle */
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      ) : (
        /* Open shackle — arc lifts off, doesn't latch on the right */
        <path d="M8 11V7a4 4 0 0 1 7.9-1" />
      )}
      {active ? (
        <circle cx="12" cy="16" r="1.2" fill="#1c1814" stroke="none" />
      ) : (
        <path d="M12 15v2.2" />
      )}
    </svg>
  );
}

/** Expand / fullscreen — corners of a rectangle pulling outward. */
export function IconExpand({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

export function IconCollapse({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="10" y1="14" x2="3" y2="21" />
      <line x1="14" y1="10" x2="21" y2="3" />
    </svg>
  );
}

/** Expand ↔ collapse with a short axial flip. */
export function IconExpandCollapse({
  collapsed,
  size = 18,
}: {
  collapsed: boolean;
  size?: number;
}) {
  return (
    <span
      className={[
        "lyra-expand-flip",
        collapsed ? "lyra-expand-flip--collapsed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="lyra-expand-flip__face lyra-expand-flip__face--expand">
        <IconExpand size={size} />
      </span>
      <span className="lyra-expand-flip__face lyra-expand-flip__face--collapse">
        <IconCollapse size={size} />
      </span>
    </span>
  );
}

/** Circular arrows — refresh / retry. */
export function IconRefresh({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
    </svg>
  );
}
