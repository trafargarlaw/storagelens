import { createRootRoute, Outlet } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { Toaster } from "sonner";

import { Sidebar } from "@/components/sidebar";
import { ScanStoreProvider } from "@/lib/scan-store";

function RootLayout() {
  return (
    <ScanStoreProvider>
      <div className="flex h-full">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
      <Toaster
        theme="system"
        position="bottom-right"
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
          } as CSSProperties
        }
        toastOptions={{
          classNames: { actionButton: "!bg-primary !text-primary-foreground !font-medium" },
        }}
      />
    </ScanStoreProvider>
  );
}

export const Route = createRootRoute({ component: RootLayout });
