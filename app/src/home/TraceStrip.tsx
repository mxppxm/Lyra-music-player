export type TraceStripItem = { id: string; coverUrl: string | null };
export type TraceStripProps = {
  items: TraceStripItem[];
  onSelect?: (id: string) => void;
};

const MAX = 5;

export function TraceStrip({ items, onSelect }: TraceStripProps) {
  if (items.length === 0) return null;
  const shown = items.slice(0, MAX);
  return (
    <div
      data-testid="trace-strip"
      data-lyra-hover="trace_strip"
      className="lyra-trace-strip"
    >
      {shown.map((item) => (
        <button
          key={item.id}
          type="button"
          className="lyra-trace-item"
          onClick={() => onSelect?.(item.id)}
          style={
            item.coverUrl
              ? { backgroundImage: `url(${item.coverUrl})` }
              : undefined
          }
          aria-label={`recall turn ${item.id}`}
        />
      ))}
    </div>
  );
}
