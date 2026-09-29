const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  let value = bytes;
  let unitIdx = 0;

  while (value >= 1024 && unitIdx + 1 < UNITS.length) {
    value /= 1024;
    unitIdx++;
  }

  if (unitIdx === 0) {
    return `${bytes} ${UNITS[unitIdx]}`;
  }

  return `${value.toFixed(1)} ${UNITS[unitIdx]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

/** Stopwatch style, e.g. "0:07" or "1:02:45". */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "0%";
  const percent = ratio * 100;
  if (percent < 0.1) return "<0.1%";
  if (percent >= 99.95) return "100%";
  return `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`;
}

export function formatRelativeTime(timestampMs: number, now = Date.now()): string {
  const seconds = Math.round((now - timestampMs) / 1000);
  if (seconds < 45) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(timestampMs).toLocaleDateString();
}
