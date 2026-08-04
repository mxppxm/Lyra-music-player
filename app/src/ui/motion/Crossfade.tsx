import type { ReactNode } from "react";

export type CrossfadeProps = {
  text: string;
  className?: string;
  children?: ReactNode;
};

export function Crossfade({ text, className, children }: CrossfadeProps) {
  return (
    <span
      key={text}
      className={className ? `lyra-text-in ${className}` : "lyra-text-in"}
    >
      {children}
    </span>
  );
}
