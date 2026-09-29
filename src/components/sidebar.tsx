import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppLogo } from "@/components/app-logo";
import { FolderIcon, HardDriveIcon, HomeIcon, Spinner, XIcon } from "@/components/icons";
import { UpdateCard } from "@/components/update-card";
import { useNow } from "@/hooks/use-now";
import { formatBytes, formatPercent, formatRelativeTime } from "@/lib/format";
import { isMac, isVolumeRoot, pathTitle } from "@/lib/paths";
import { useScanStore } from "@/lib/scan-store";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { history, result, scanning, volumes, openScan, deleteScan } = useScanStore();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const now = useNow(30_000);

  const progress = scanning?.progress;
  const scanStatus =
    progress?.target_bytes != null && progress.target_bytes > 0
      ? formatPercent(progress.scanned_bytes / progress.target_bytes)
      : progress
        ? formatBytes(progress.scanned_bytes)
        : null;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Room for the macOS traffic lights, which overlay the content. */}
      {isMac && <div data-tauri-drag-region className="h-7 shrink-0" />}

      <div data-tauri-drag-region className="flex h-12 shrink-0 items-center gap-2.5 px-4">
        <AppLogo aria-hidden="true" className="size-6 shrink-0 text-primary-text" />
        <span data-tauri-drag-region className="text-[14px] font-semibold tracking-tight">
          StorageLens
        </span>
      </div>

      <nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
        <NavLink to="/" active={pathname === "/"} icon={<HomeIcon />}>
          Overview
        </NavLink>
        {scanning && (
          <NavLink
            to="/scanning"
            active={pathname === "/scanning"}
            icon={<Spinner className="text-primary-text" />}
            trailing={scanStatus}
          >
            Scanning…
          </NavLink>
        )}
      </nav>

      <h2 className="mt-5 mb-1 px-4 text-[11px] font-medium text-muted-foreground">Recent scans</h2>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {history.length === 0 ? (
          <p className="px-2 py-1.5 text-[12px] text-muted-foreground">
            Scans you run appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {history.map((item) => {
              const title = pathTitle(item.root_path, volumes);
              const active = pathname === "/results" && result?.scan_id === item.scan_id;
              const Icon = isVolumeRoot(item.root_path, volumes) ? HardDriveIcon : FolderIcon;
              return (
                <li
                  key={item.scan_id}
                  className={cn(
                    "group relative rounded-md",
                    active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
                  )}
                >
                  <button
                    type="button"
                    title={item.root_path}
                    aria-current={active ? "page" : undefined}
                    onClick={() => void openScan(item.scan_id)}
                    className="flex w-full min-w-0 items-center gap-2.5 rounded-md py-1.5 pr-8 pl-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-primary-text" : "text-muted-foreground",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{title}</span>
                      <span className="block truncate text-[11px] text-muted-foreground tabular-nums">
                        {formatBytes(item.total_size)} ·{" "}
                        {formatRelativeTime(item.created_at_ms, now)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove scan of ${title}`}
                    title="Remove from list"
                    onClick={() => void deleteScan(item.scan_id)}
                    className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none group-hover:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <UpdateCard />
    </aside>
  );
}

function NavLink({
  to,
  active,
  icon,
  trailing,
  children,
}: {
  to: "/" | "/scanning";
  active: boolean;
  icon: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0",
        active
          ? "bg-sidebar-accent text-foreground [&_svg]:text-primary-text"
          : "text-foreground/80 hover:bg-sidebar-accent/60 [&_svg]:text-muted-foreground",
      )}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {trailing && (
        <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
          {trailing}
        </span>
      )}
    </Link>
  );
}
