import { createFileRoute, Link } from "@tanstack/react-router";

import { FolderIcon, HardDriveIcon } from "@/components/icons";
import { Toolbar, ToolbarSpacer, ToolbarTitle } from "@/components/toolbar";
import { buttonVariants } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { formatBytes, formatElapsed, formatNumber, formatPercent } from "@/lib/format";
import { isVolumeRoot, pathTitle } from "@/lib/paths";
import { useScanStore } from "@/lib/scan-store";

export const Route = createFileRoute("/scanning")({
  component: ScanningPage,
});

function ScanningPage() {
  const { scanning, volumes } = useScanStore();
  const now = useNow(1000);

  if (!scanning) {
    return (
      <>
        <Toolbar>
          <ToolbarTitle>Scanning</ToolbarTitle>
          <ToolbarSpacer />
        </Toolbar>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-muted-foreground">No scan is running.</p>
          <Link to="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Go to Overview
          </Link>
        </div>
      </>
    );
  }

  const { path, progress, startedAt } = scanning;
  const title = path ? pathTitle(path, volumes) : "your files";
  const Icon = path && !isVolumeRoot(path, volumes) ? FolderIcon : HardDriveIcon;

  const scanned = progress?.scanned_bytes ?? 0;
  const target = progress?.target_bytes ?? null;
  // Without a known total (e.g. on Windows) there's no honest percentage to show.
  const ratio = target && target > 0 ? Math.min(1, scanned / target) : null;

  return (
    <>
      <Toolbar>
        <ToolbarTitle>Scanning</ToolbarTitle>
        <ToolbarSpacer />
      </Toolbar>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
        <div className="w-full max-w-lg fade-in">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary-text">
              <Icon className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-semibold">Scanning {title}</h2>
              {path && (
                <p className="truncate text-[12px] text-muted-foreground" title={path}>
                  {path}
                </p>
              )}
            </div>
          </div>

          <div
            className="mt-6"
            role="progressbar"
            aria-label={`Scanning ${title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ratio === null ? undefined : Math.round(ratio * 100)}
            aria-valuetext={ratio === null ? `${formatBytes(scanned)} found` : undefined}
          >
            <div className="h-2 overflow-hidden rounded-full bg-primary/15">
              {ratio === null ? (
                <div className="progress-indeterminate h-full w-2/5 rounded-full bg-primary" />
              ) : (
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${ratio * 100}%` }}
                />
              )}
            </div>
            <div className="mt-2 flex justify-between text-[12px] text-muted-foreground tabular-nums">
              <span>
                {ratio === null
                  ? "Reading folders…"
                  : `${formatBytes(scanned)} of ${formatBytes(target ?? 0)}`}
              </span>
              {ratio !== null && <span>{formatPercent(ratio)}</span>}
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-3 gap-3">
            <Stat label="Data found" value={formatBytes(scanned)} />
            <Stat
              label="Folders scanned"
              value={formatNumber(progress?.scanned_directories ?? 0)}
            />
            <Stat label="Elapsed" value={formatElapsed(now - startedAt)} />
          </dl>

          <p className="mt-6 text-[12px] text-muted-foreground">
            Results open automatically when the scan finishes. You can keep using the app in the
            meantime.
          </p>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
