import { useNavigate, useRouterState } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { pathTitle } from "@/lib/paths";
import type { ScanHistoryItem, ScanProgress, ScanResult, Volume } from "@/types";

export interface ActiveScan {
  /** Unknown when the app was reloaded while a scan was already running. */
  path: string | null;
  startedAt: number;
  progress: ScanProgress | null;
}

interface ScanStore {
  ready: boolean;
  volumes: Volume[];
  history: ScanHistoryItem[];
  /** The scan the backend currently serves `get_children` for. */
  result: ScanResult | null;
  scanning: ActiveScan | null;
  startScan: (path: string) => Promise<void>;
  pickFolderAndScan: () => Promise<void>;
  openScan: (scanId: string) => Promise<void>;
  deleteScan: (scanId: string) => Promise<void>;
}

const ScanStoreContext = createContext<ScanStore | null>(null);

export function useScanStore(): ScanStore {
  const store = useContext(ScanStoreContext);
  if (!store) throw new Error("useScanStore must be used inside <ScanStoreProvider>");
  return store;
}

export function ScanStoreProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const [ready, setReady] = useState(false);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState<ActiveScan | null>(null);

  // Event listeners are registered once, so they read the latest values through refs.
  const pathnameRef = useRef(pathname);
  const resultRef = useRef(result);
  const volumesRef = useRef(volumes);
  const scanningRef = useRef(scanning);
  pathnameRef.current = pathname;
  resultRef.current = result;
  volumesRef.current = volumes;
  scanningRef.current = scanning;

  const refreshHistory = useCallback(async () => {
    setHistory(await invoke<ScanHistoryItem[]>("list_scan_history"));
  }, []);

  const refreshVolumes = useCallback(async () => {
    setVolumes(prepareVolumes(await invoke<Volume[]>("list_volumes")));
  }, []);

  const openScan = useCallback(
    async (scanId: string) => {
      try {
        const next = await invoke<ScanResult>("activate_scan", { id: scanId });
        setResult(next);
        await navigate({ to: "/results" });
      } catch (err) {
        toast.error(`Couldn't open this scan: ${err}`);
      }
    },
    [navigate],
  );

  const startScan = useCallback(
    async (path: string) => {
      if (scanningRef.current) {
        toast.info("A scan is already running");
        await navigate({ to: "/scanning" });
        return;
      }
      try {
        await invoke("start_scan", { path });
        setScanning({ path, startedAt: Date.now(), progress: null });
        await navigate({ to: "/scanning" });
      } catch (err) {
        toast.error(`Couldn't start the scan: ${err}`);
      }
    },
    [navigate],
  );

  const pickFolderAndScan = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose a folder to scan",
    });
    if (typeof selected === "string") {
      await startScan(selected);
    }
  }, [startScan]);

  const deleteScan = useCallback(
    async (scanId: string) => {
      try {
        await invoke("delete_scan", { id: scanId });
        await refreshHistory();
        if (resultRef.current?.scan_id !== scanId) return;

        // The backend falls back to the newest remaining scan.
        const next = await invoke<ScanResult>("get_scan_result").catch(() => null);
        setResult(next);
        if (!next && pathnameRef.current === "/results") {
          await navigate({ to: "/" });
        }
      } catch (err) {
        toast.error(`Couldn't remove this scan: ${err}`);
      }
    },
    [navigate, refreshHistory],
  );

  useEffect(() => {
    let disposed = false;

    const listeners = Promise.all([
      listen<ScanProgress>("scan-progress", (event) => {
        setScanning((prev) =>
          prev
            ? { ...prev, progress: event.payload }
            : { path: null, startedAt: Date.now(), progress: event.payload },
        );
      }),

      listen<ScanResult>("scan-complete", async (event) => {
        const finished = event.payload;
        const title = pathTitle(finished.root_path, volumesRef.current);
        setScanning(null);
        void refreshHistory();
        void refreshVolumes();

        const viewing = resultRef.current;
        if (pathnameRef.current === "/results" && viewing && viewing.scan_id !== finished.scan_id) {
          // The backend just made the new scan active; keep serving the one on screen.
          await invoke("activate_scan", { id: viewing.scan_id }).catch(() => undefined);
          toast.success(`Finished scanning ${title}`, {
            action: { label: "View", onClick: () => void openScan(finished.scan_id) },
          });
          return;
        }

        setResult(finished);
        if (pathnameRef.current === "/scanning") {
          await navigate({ to: "/results" });
        } else {
          toast.success(`Finished scanning ${title}`, {
            action: { label: "View", onClick: () => void navigate({ to: "/results" }) },
          });
        }
      }),

      listen<string>("scan-error", async (event) => {
        setScanning(null);
        toast.error(`Scan failed: ${event.payload}`);
        if (pathnameRef.current === "/scanning") {
          await navigate({ to: resultRef.current ? "/results" : "/" });
        }
      }),
    ]);

    const load = async () => {
      try {
        const [nextVolumes, nextHistory, isScanning, active] = await Promise.all([
          invoke<Volume[]>("list_volumes"),
          invoke<ScanHistoryItem[]>("list_scan_history"),
          invoke<boolean>("is_scanning"),
          invoke<ScanResult>("get_scan_result").catch(() => null),
        ]);
        if (disposed) return;
        setVolumes(prepareVolumes(nextVolumes));
        setHistory(nextHistory);
        setResult(active);
        if (isScanning) {
          setScanning((prev) => prev ?? { path: null, startedAt: Date.now(), progress: null });
        }
      } catch (err) {
        toast.error(`Couldn't load drives: ${err}`);
      } finally {
        if (!disposed) setReady(true);
      }
    };
    void load();

    return () => {
      disposed = true;
      void listeners.then((unlisteners) => {
        for (const unlisten of unlisteners) unlisten();
      });
    };
  }, [navigate, openScan, refreshHistory, refreshVolumes]);

  const value = useMemo<ScanStore>(
    () => ({
      ready,
      volumes,
      history,
      result,
      scanning,
      startScan,
      pickFolderAndScan,
      openScan,
      deleteScan,
    }),
    [ready, volumes, history, result, scanning, startScan, pickFolderAndScan, openScan, deleteScan],
  );

  return <ScanStoreContext.Provider value={value}>{children}</ScanStoreContext.Provider>;
}

function prepareVolumes(volumes: Volume[]): Volume[] {
  const seen = new Set<string>();
  return volumes
    .filter((volume) => volume.total_bytes > 0)
    .filter((volume) => !volume.mount_point.startsWith("/System/Volumes/"))
    .filter((volume) => {
      const key = `${volume.name}|${volume.total_bytes}|${volume.used_bytes}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.total_bytes - a.total_bytes);
}
