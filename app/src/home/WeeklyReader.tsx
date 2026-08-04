// WeeklyReader — full-screen modal that renders the weekly letter's HTML
// in a sandboxed iframe. Opened by the /week slash command. Esc / backdrop
// click / 「关」 button close it. The HTML itself is a standalone document
// with inline CSS/SVG produced by weeklyRenderer.render().
import { useEffect } from "react";
import { AnimatedMount } from "../ui/motion/AnimatedMount";

export type WeeklyReaderProps = {
  html: string | null;
  onClose: () => void;
};

export function WeeklyReader({ html, onClose }: WeeklyReaderProps) {
  useEffect(() => {
    if (html === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [html, onClose]);

  return (
    <AnimatedMount
      open={html !== null}
      zIndex={9998}
      variant="fullscreen"
      backdrop={
        <div
          data-testid="weekly-reader-backdrop"
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        />
      }
    >
      <div
        role="dialog"
        aria-label="Weekly letter"
        data-testid="weekly-reader"
        style={{
          position: "fixed",
          inset: "5vh 5vw",
          background: "#fafaf7",
          zIndex: 9999,
          borderRadius: 6,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <iframe
          data-testid="weekly-reader-iframe"
          title="weekly letter"
          srcDoc={html ?? ""}
          sandbox=""
          style={{
            flex: 1,
            width: "100%",
            border: "none",
            background: "#fafaf7",
          }}
        />
        <button
          data-testid="weekly-reader-close"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            borderRadius: 16,
            border: "none",
            background: "rgba(255,255,255,0.85)",
            fontSize: 18,
            lineHeight: 1,
            color: "#666",
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          }}
          aria-label="Close weekly reader"
        >
          ×
        </button>
      </div>
    </AnimatedMount>
  );
}
