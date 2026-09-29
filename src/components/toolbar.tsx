import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Page header. Empty areas drag the window (the attribute doesn't inherit to children). */
export function Toolbar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <header
      data-tauri-drag-region
      className={cn("flex h-12 shrink-0 items-center gap-2 border-b px-4", className)}
    >
      {children}
    </header>
  );
}

export function ToolbarTitle({ children }: { children: ReactNode }) {
  return (
    <h1 data-tauri-drag-region className="truncate text-[13px] font-semibold">
      {children}
    </h1>
  );
}

export function ToolbarSpacer() {
  return <div data-tauri-drag-region className="h-full flex-1" />;
}
