import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSectionAmbient } from '../useSectionAmbient';

describe('useSectionAmbient', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--ambient-color');
    document.body.removeAttribute('data-dark');
  });

  it('writes the first section color on mount', () => {
    const refs = Array.from({ length: 3 }, () => ({ current: document.createElement('section') }));
    renderHook(() => useSectionAmbient(refs, {
      colors: ['hsl(0, 0%, 90%)', 'hsl(120, 30%, 40%)', 'hsl(240, 50%, 20%)'],
      darkSections: new Set([2]),
    }));
    expect(document.documentElement.style.getPropertyValue('--ambient-color'))
      .toBe('hsl(0, 0%, 90%)');
  });

  it('toggles data-dark on body when active section is in darkSections', () => {
    const refs = [{ current: document.createElement('section') }];
    renderHook(() => useSectionAmbient(refs, {
      colors: ['hsl(240, 50%, 20%)'],
      darkSections: new Set([0]),
    }));
    expect(document.body.getAttribute('data-dark')).toBe('true');
  });

  it('fires onActiveChange on initial apply', () => {
    const refs = [{ current: document.createElement('section') }];
    let seen: number | undefined;
    renderHook(() => useSectionAmbient(refs, {
      colors: ['hsl(0, 0%, 90%)'],
      darkSections: new Set(),
      onActiveChange: (i) => { seen = i; },
    }));
    expect(seen).toBe(0);
  });
});
