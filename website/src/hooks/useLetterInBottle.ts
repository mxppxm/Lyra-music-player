import { useMemo } from 'react';

const KEY = 'lyra_bottle_letters';
const MAX_LEN = 500;

interface Letter { text: string; at: number; }

function readSafe(): Letter[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useLetterInBottle() {
  const initial = useMemo(() => readSafe(), []);
  const save = (text: string) => {
    try {
      const list = readSafe();
      list.push({ text: text.slice(0, MAX_LEN), at: Date.now() });
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      // localStorage unavailable — silently fail
    }
  };
  return { hasPreviousLetter: initial.length > 0, save };
}
