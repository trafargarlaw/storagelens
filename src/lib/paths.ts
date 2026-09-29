import type { Volume } from "@/types";

const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;

export const isMac = /Macintosh|Mac OS X/.test(userAgent);
export const isWindows = /Windows/.test(userAgent);

export const revealLabel = isMac
  ? "Show in Finder"
  : isWindows
    ? "Show in Explorer"
    : "Show in File Manager";

const DRIVE_ROOT = /^([a-z]:)[\\/]?$/i;

function normalize(path: string): string {
  return path.replace(/[\\/]+$/, "").toLowerCase();
}

export function findVolume(path: string, volumes: Volume[]): Volume | undefined {
  const target = normalize(path);
  return volumes.find((volume) => normalize(volume.mount_point) === target);
}

/** "Local Disk (C:)" on Windows, the volume name elsewhere. */
export function volumeLabel(volume: Volume): string {
  const drive = DRIVE_ROOT.exec(volume.mount_point)?.[1]?.toUpperCase();
  if (drive) {
    return `${volume.name || (volume.is_removable ? "USB Drive" : "Local Disk")} (${drive})`;
  }
  return volume.name || volume.mount_point;
}

/** Short display name for a scanned path: the volume label for drive roots, else the last segment. */
export function pathTitle(path: string, volumes: Volume[]): string {
  const volume = findVolume(path, volumes);
  if (volume) return volumeLabel(volume);

  const drive = DRIVE_ROOT.exec(path)?.[1];
  if (drive) return drive.toUpperCase();

  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

export function isVolumeRoot(path: string, volumes: Volume[]): boolean {
  return findVolume(path, volumes) !== undefined || DRIVE_ROOT.test(path) || path === "/";
}
