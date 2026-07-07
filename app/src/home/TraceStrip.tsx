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
      style={{
        display: "flex",
        justifyContent: "center",
        gap: "var(--lyra-trace-item-gap)",
      }}
    >
      {shown.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect?.(item.id)}
          style={{
            width: "var(--lyra-trace-item-size)",
            height: "var(--lyra-trace-item-size)",
            borderRadius: 2,
            border: "none",
            padding: 0,
            opacity: 0.65,
            cursor: "pointer",
            background: item.coverUrl ? `url(${item.coverUrl})` : "rgba(0,0,0,0.28)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            transition: "opacity 200ms ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = "0.65";
          }}
          aria-label={`recall turn ${item.id}`}
        />
      ))}
    </div>
  );
}
