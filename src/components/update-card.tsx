import { DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useAutoUpdate } from "@/hooks/use-auto-update";

export function UpdateCard() {
  const updater = useAutoUpdate();
  const { status, availableVersion, progress } = updater;

  if (updater.isUnsupported) return null;
  if (status !== "available" && status !== "downloading" && status !== "downloaded") return null;

  const version = availableVersion ? `Version ${availableVersion}` : "A new version";

  return (
    <div className="m-2 rounded-lg border bg-background p-3 fade-in">
      <div className="flex items-center gap-2 font-medium">
        <DownloadIcon className="size-4 text-primary-text" />
        {status === "downloaded" ? "Update ready" : "Update available"}
      </div>

      {status === "available" && (
        <>
          <p className="mt-1 text-[12px] text-muted-foreground">{version} is ready to download.</p>
          <Button size="lg" className="mt-2.5 w-full" onClick={() => void updater.downloadUpdate()}>
            Download
          </Button>
        </>
      )}

      {status === "downloading" && (
        <div
          className="mt-2.5"
          role="progressbar"
          aria-label="Downloading update"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div className="h-1.5 overflow-hidden rounded-full bg-primary/15">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-muted-foreground tabular-nums">
            Downloading… {Math.round(progress)}%
          </p>
        </div>
      )}

      {status === "downloaded" && (
        <>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {version} installs when StorageLens restarts.
          </p>
          <Button size="lg" className="mt-2.5 w-full" onClick={() => void updater.installUpdate()}>
            Restart to update
          </Button>
        </>
      )}
    </div>
  );
}
