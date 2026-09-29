import { createFileRoute, Link } from "@tanstack/react-router";

import {
  AlertIcon,
  ChevronRightIcon,
  FolderPlusIcon,
  HardDriveIcon,
  Spinner,
} from "@/components/icons";
import { Toolbar, ToolbarSpacer, ToolbarTitle } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { formatBytes, formatPercent } from "@/lib/format";
import { pathTitle, volumeLabel } from "@/lib/paths";
import { useScanStore } from "@/lib/scan-store";
import { cn } from "@/lib/utils";
import type { Volume } from "@/types";

export const Route = createFileRoute("/")({
  component: OverviewPage,
});

function OverviewPage() {
  const { ready, volumes, scanning, startScan, pickFolderAndScan } = useScanStore();

  return (
    <>
      <Toolbar>
        <ToolbarTitle>Overview</ToolbarTitle>
        <ToolbarSpacer />
        <Button
          variant="outline"
          size="lg"
          disabled={scanning !== null}
          onClick={() => void pickFolderAndScan()}
        >
          <FolderPlusIcon />
          Scan a folder…
        </Button>
      </Toolbar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-6">
          {scanning && <ScanningBanner />}

          <section aria-labelledby="drives-heading">
            <h2 id="drives-heading" className="text-[15px] font-semibold">
              Drives
            </h2>
            <p className="mt-0.5 text-muted-foreground">
              Pick a drive to see what's taking up space.
            </p>

            {ready && volumes.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed px-4 py-8 text-center text-muted-foreground">
                No drives found. You can still scan a folder.
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
                {volumes.map((volume) => (
                  <DriveCard
                    key={volume.mount_point}
                    volume={volume}
                    disabled={scanning !== null}
                    onScan={() => void startScan(volume.mount_point)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function ScanningBanner() {
  const { scanning, volumes } = useScanStore();
  if (!scanning) return null;

  const title = scanning.path ? pathTitle(scanning.path, volumes) : "your files";
  const found = scanning.progress?.scanned_bytes ?? 0;

  return (
    <Link
      to="/scanning"
      className="mb-6 flex items-center gap-3 rounded-lg border bg-card px-4 py-3 outline-none fade-in hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Spinner className="size-4 text-primary-text" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">Scanning {title}…</span>
        <span className="block text-[12px] text-muted-foreground tabular-nums">
          {formatBytes(found)} found so far
        </span>
      </span>
      <span className="flex items-center gap-0.5 text-[12px] font-medium text-primary-text">
        View progress
        <ChevronRightIcon className="size-3.5" />
      </span>
    </Link>
  );
}

function DriveCard({
  volume,
  disabled,
  onScan,
}: {
  volume: Volume;
  disabled: boolean;
  onScan: () => void;
}) {
  const label = volumeLabel(volume);
  const ratio = volume.total_bytes > 0 ? volume.used_bytes / volume.total_bytes : 0;
  const almostFull = ratio >= 0.9;
  const details = [volume.fs_type, volume.is_removable ? "Removable" : null].filter(Boolean);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onScan}
      title={disabled ? "Wait for the current scan to finish" : undefined}
      aria-label={`Scan ${label}: ${formatBytes(volume.used_bytes)} used of ${formatBytes(volume.total_bytes)}${almostFull ? ", almost full" : ""}`}
      className="group flex flex-col gap-4 rounded-lg border bg-card p-4 text-left transition-colors outline-none hover:border-foreground/20 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-card"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <HardDriveIcon className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{label}</div>
          <div className="truncate text-[12px] text-muted-foreground">{details.join(" · ")}</div>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2 text-[12px] tabular-nums">
          <span>
            <span className="font-medium">{formatBytes(volume.used_bytes)}</span>
            <span className="text-muted-foreground">
              {" "}
              used of {formatBytes(volume.total_bytes)}
            </span>
          </span>
          <span className="text-muted-foreground">{formatPercent(ratio)}</span>
        </div>
        <div
          className={cn(
            "mt-2 h-1.5 overflow-hidden rounded-full",
            almostFull ? "bg-destructive/15" : "bg-primary/15",
          )}
        >
          <div
            className={cn("h-full rounded-full", almostFull ? "bg-destructive" : "bg-primary")}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-[12px]">
        {almostFull ? (
          <span className="flex items-center gap-1 font-medium text-destructive-text tabular-nums">
            <AlertIcon className="size-3.5" />
            Almost full · {formatBytes(volume.available_bytes)} free
          </span>
        ) : (
          <span className="text-muted-foreground tabular-nums">
            {formatBytes(volume.available_bytes)} free
          </span>
        )}
        <span className="flex items-center gap-0.5 font-medium text-primary-text group-disabled:text-muted-foreground">
          Scan
          <ChevronRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5 group-disabled:group-hover:translate-x-0" />
        </span>
      </div>
    </button>
  );
}
