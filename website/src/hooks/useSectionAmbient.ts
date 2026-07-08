import { useEffect, useRef } from 'react';

export interface UseSectionAmbientOpts {
  colors: readonly string[];
  darkSections: ReadonlySet<number>;
  onActiveChange?: (idx: number) => void;
}

export function useSectionAmbient(
  refs: React.RefObject<HTMLElement | null>[],
  opts: UseSectionAmbientOpts,
): void {
  const activeIndexRef = useRef(-1);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const apply = (idx: number) => {
      if (idx === activeIndexRef.current) return;
      activeIndexRef.current = idx;
      const color = optsRef.current.colors[idx];
      if (color) {
        document.documentElement.style.setProperty('--ambient-color', color);
      }
      if (optsRef.current.darkSections.has(idx)) {
        document.body.setAttribute('data-dark', 'true');
      } else {
        document.body.removeAttribute('data-dark');
      }
      optsRef.current.onActiveChange?.(idx);
    };

    apply(0);

    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length === 0) return;
        const idx = refs.findIndex((r) => r.current === visible[0].target);
        if (idx >= 0) apply(idx);
      },
      { threshold: [0.3, 0.6] },
    );

    refs.forEach((r) => {
      if (r.current) observer.observe(r.current);
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
