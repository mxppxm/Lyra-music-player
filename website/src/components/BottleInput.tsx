import { useEffect, useRef, useState } from 'react';
import { HERO } from '../copy/ledger';
import { useLetterInBottle } from '../hooks/useLetterInBottle';

type Phase = 'input' | 'fadingOut' | 'reply' | 'replyWithAside' | 'settling';

export function BottleInput() {
  const { hasPreviousLetter, save } = useLetterInBottle();
  const [phase, setPhase] = useState<Phase>('input');
  const [text, setText] = useState('');
  const timersRef = useRef<number[]>([]);

  useEffect(() => () => {
    timersRef.current.forEach((id) => clearTimeout(id));
  }, []);

  const placeholder = hasPreviousLetter
    ? HERO.inputPlaceholderReturning
    : HERO.inputPlaceholder;

  const schedule = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const trimmed = text.trim();
    if (!trimmed || phase !== 'input') return;
    save(trimmed);
    setPhase('fadingOut');
    schedule(() => setPhase('reply'), 400);
    schedule(() => setPhase('replyWithAside'), 400 + 600 + 3000);
    schedule(() => setPhase('settling'), 400 + 600 + 3000 + 12000);
    schedule(() => { setPhase('input'); setText(''); }, 400 + 600 + 3000 + 12000 + 4000);
  };

  const inputInvisible = phase !== 'input';
  const showReply = phase === 'reply' || phase === 'replyWithAside' || phase === 'settling';
  const showAside = phase === 'replyWithAside' || phase === 'settling';
  const dimReply = phase === 'settling';

  return (
    <div style={{ width: 'min(560px, 80vw)', margin: '0 auto', textAlign: 'center' }}>
      <input
        aria-label="给 Lyra 留一句话"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        style={{
          width: '100%', height: 44, padding: '0 22px',
          borderRadius: 22, border: 'none',
          background: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(20px)',
          fontSize: 15, fontFamily: 'var(--font-sans)',
          color: 'var(--text-color)',
          transition: 'opacity var(--motion-fast) var(--ease-out)',
          opacity: inputInvisible ? 0 : 1,
          pointerEvents: inputInvisible ? 'none' : 'auto',
          outline: 'none',
        }}
      />
      <p style={{
        marginTop: 12, fontSize: 12, color: 'var(--text-color-dim)',
        transition: 'opacity var(--motion-fast) var(--ease-out)',
        opacity: inputInvisible ? 0 : 1,
      }}>
        {HERO.inputHint}
      </p>

      {showReply && (
        <div style={{
          fontFamily: 'var(--font-serif-italic)', fontStyle: 'italic',
          fontSize: 18, color: 'var(--text-color-soft)',
          marginTop: -20,
          transition: 'opacity var(--motion-medium) var(--ease-out)',
          opacity: dimReply ? 0 : 1,
        }}>
          {HERO.bottleReplyMain}
          {showAside && (
            <div style={{
              marginTop: 12, fontSize: 13, color: 'var(--text-color-dim)',
              transition: 'opacity var(--motion-medium) var(--ease-out)',
              opacity: dimReply ? 0 : 1,
            }}>
              {HERO.bottleReplyAside}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
