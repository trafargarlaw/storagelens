import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import type { Volume } from "@/types";

export const Route = createFileRoute("/")({
  component: ScanSetupPage,
});

function ScanSetupPage() {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    invoke<Volume[]>("list_volumes")
      .then((v) => {
        // Keep meaningful user-visible volumes and drop APFS/system pseudo-volumes.
        const filtered = v
          .filter((vol) => vol.total_bytes > 0)
          .filter((vol) => !isSystemPseudoVolume(vol.mount_point));
        const deduped = dedupeVolumes(filtered);
        // Sort: largest first
        deduped.sort((a, b) => b.total_bytes - a.total_bytes);
        setVolumes(deduped);
      })
      .catch((err) => {
        toast.error(`Failed to list volumes: ${err}`);
      })
      .finally(() => setLoading(false));
  }, []);

  const startScan = useCallback(
    async (path: string) => {
      try {
        await invoke("start_scan", { path });
        navigate({ to: "/results" });
      } catch (err) {
        toast.error(`Failed to start scan: ${err}`);
      }
    },
    [navigate],
  );

  const pickFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      void startScan(selected);
    }
  }, [startScan]);

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-hidden px-6">
      <div className="w-full max-w-lg space-y-10">
        {/* Header */}
        <div className="space-y-2 text-center">
          <div className="mx-auto mb-4 flex justify-center">
            <AppLogo aria-hidden="true" className="size-14 rounded-2xl" />
          </div>
          <p className="text-muted-foreground text-sm">
            Visualize storage usage across volumes and folders
          </p>
        </div>

        {/* Volumes */}
        <div className="space-y-3">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Volumes
          </p>

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[72px] animate-pulse rounded-lg bg-muted/40"
                />
              ))}
            </div>
          ) : volumes.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground text-sm">
              No volumes found
            </p>
          ) : (
            <div className="space-y-2">
              {volumes.map((vol) => (
                <VolumeCard
                  key={vol.mount_point}
                  volume={vol}
                  onScan={() => void startScan(vol.mount_point)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-muted-foreground text-xs">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Custom folder */}
        <Button
          variant="outline"
          size="lg"
          className="w-full justify-center gap-2"
          onClick={pickFolder}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
          </svg>
          Scan a specific folder
        </Button>
      </div>
    </div>
  );
}

function VolumeCard({
  volume,
  onScan,
}: {
  volume: Volume;
  onScan: () => void;
}) {
  const usedPercent =
    volume.total_bytes > 0 ? (volume.used_bytes / volume.total_bytes) * 100 : 0;

  const displayName = volume.name || volume.mount_point;

  return (
    <button
      type="button"
      onClick={onScan}
      className="group flex w-full cursor-pointer items-center gap-4 rounded-lg bg-card p-4 text-left ring-1 ring-foreground/10 transition-all hover:bg-accent hover:ring-foreground/20"
    >
      {/* Drive icon */}
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/60">
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 12h.01" />
          <path d="M10 12h.01" />
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-medium text-sm">{displayName}</span>
          <span className="text-muted-foreground text-xs">
            {formatBytes(volume.used_bytes)} / {formatBytes(volume.total_bytes)}
          </span>
        </div>
        {/* Usage bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${usedPercent}%` }}
          />
        </div>
      </div>

      {/* Arrow */}
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}

function dedupeVolumes(volumes: Volume[]): Volume[] {
  const seen = new Set<string>();
  const result: Volume[] = [];

  for (const volume of volumes) {
    // sysinfo may surface duplicate APFS entries with identical user-facing stats.
    const key = `${volume.name}|${volume.total_bytes}|${volume.used_bytes}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(volume);
  }

  return result;
}

function isSystemPseudoVolume(mountPoint: string): boolean {
  return mountPoint.startsWith("/System/Volumes/");
}
