/**
 * The surface everything on a browse page sits on. Values from tokens only.
 */
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-n-200 bg-paper shadow-card ${className}`}>
      {children}
    </div>
  );
}
