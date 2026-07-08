import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLetterInBottle } from '../useLetterInBottle';

const KEY = 'lyra_bottle_letters';

describe('useLetterInBottle', () => {
  beforeEach(() => { localStorage.clear(); });

  it('hasPreviousLetter is false when storage empty', () => {
    const { result } = renderHook(() => useLetterInBottle());
    expect(result.current.hasPreviousLetter).toBe(false);
  });

  it('save appends a letter with timestamp', () => {
    const { result } = renderHook(() => useLetterInBottle());
    act(() => result.current.save('今天有点累'));
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].text).toBe('今天有点累');
    expect(typeof stored[0].at).toBe('number');
  });

  it('truncates to 500 chars', () => {
    const { result } = renderHook(() => useLetterInBottle());
    const long = 'a'.repeat(1000);
    act(() => result.current.save(long));
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
    expect(stored[0].text.length).toBe(500);
  });

  it('survives corrupt storage silently', () => {
    localStorage.setItem(KEY, 'not-json');
    const { result } = renderHook(() => useLetterInBottle());
    expect(result.current.hasPreviousLetter).toBe(false);
    act(() => result.current.save('hi'));
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
    expect(stored).toHaveLength(1);
  });

  it('remembers previous letters across mounts', () => {
    const first = renderHook(() => useLetterInBottle());
    act(() => first.result.current.save('晚上好'));
    const second = renderHook(() => useLetterInBottle());
    expect(second.result.current.hasPreviousLetter).toBe(true);
  });
});
