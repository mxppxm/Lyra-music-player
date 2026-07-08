import { MEMORY } from '../../copy/ledger';

export function MemoryFile() {
  return (
    <div style={{
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13, lineHeight: 1.8,
      background: 'rgba(255, 255, 255, 0.5)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(0, 0, 0, 0.06)',
      borderRadius: 8,
      padding: 24,
      maxWidth: 480,
      color: 'var(--text-color-soft)',
      userSelect: 'text',
    }}>
      {MEMORY.fileLines.map((line, i) => (
        <div key={i} style={{ whiteSpace: 'pre' }}>{line || ' '}</div>
      ))}
    </div>
  );
}
