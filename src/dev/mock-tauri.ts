/**
 * Fake backend for previewing the UI in a plain browser (`pnpm dev`, then open
 * http://localhost:1420). Only loaded in development when the Tauri runtime is absent.
 *
 * Query flags: `?empty` starts with no scan history, `?update` pretends an update is available.
 */
import { mockIPC } from "@tauri-apps/api/mocks";

import type { ScanHistoryItem, ScanNode, ScanProgress, ScanResult, Volume } from "@/types";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

const params = new URLSearchParams(window.location.search);

const volumes: Volume[] = [
  {
    name: "Local Disk",
    mount_point: "C:\\",
    total_bytes: 953 * GB,
    available_bytes: 196 * GB,
    used_bytes: 757 * GB,
    fs_type: "NTFS",
    is_removable: false,
  },
  {
    name: "Data",
    mount_point: "D:\\",
    total_bytes: 1863 * GB,
    available_bytes: 1102 * GB,
    used_bytes: 761 * GB,
    fs_type: "NTFS",
    is_removable: false,
  },
  {
    name: "",
    mount_point: "E:\\",
    total_bytes: 59 * GB,
    available_bytes: 3.1 * GB,
    used_bytes: 55.9 * GB,
    fs_type: "exFAT",
    is_removable: true,
  },
];

// ---------------------------------------------------------------------------
// Fake scan trees

interface MockNode {
  parent_id: number | null;
  name: string;
  kind: "directory" | "file";
  size: number;
  children: number[];
  denied: number;
}

interface MockScan {
  result: ScanResult;
  createdAt: number;
  nodes: MockNode[];
}

type Spec = [name: string, size: number, children?: Spec[]];

let seed = 7;
function random(): number {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

function files(prefix: string, ext: string, count: number, total: number): Spec[] {
  const weights = Array.from({ length: count }, () => random() ** 3 + 0.01);
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w, i) => [
    `${prefix}${String(i + 1).padStart(4, "0")}.${ext}`,
    (w / sum) * total,
  ]);
}

function driveSpec(): Spec[] {
  return [
    [
      "Users",
      0,
      [
        [
          "alex",
          0,
          [
            [
              "AppData",
              0,
              [
                [
                  "Local",
                  0,
                  [
                    ["Docker", 0, [["wsl", 0, [["docker_data.vhdx", 64 * GB]]]]],
                    ["Google", 0, [["Chrome", 0, files("cache_", "bin", 400, 3.4 * GB)]]],
                    ["Temp", 0, files("tmp", "tmp", 5000, 6.2 * GB)],
                    ["npm-cache", 0, files("pkg", "tgz", 900, 4.8 * GB)],
                  ],
                ],
                ["Roaming", 0, [["Code", 0, files("state", "db", 60, 1.1 * GB)]]],
              ],
            ],
            ["Videos", 0, files("Recording ", "mp4", 38, 118 * GB)],
            ["Downloads", 0, files("download-", "zip", 140, 42 * GB)],
            ["Documents", 0, files("Document ", "docx", 300, 6.5 * GB)],
            ["Pictures", 0, files("IMG_", "jpg", 1800, 21 * GB)],
            [
              "code",
              0,
              [
                [
                  "storagelens",
                  0,
                  [
                    ["node_modules", 0, files("module", "js", 1200, 0.9 * GB)],
                    ["target", 0, files("artifact", "rlib", 300, 7.4 * GB)],
                  ],
                ],
                ["website", 0, files("file", "ts", 220, 0.4 * GB)],
              ],
            ],
            ["NTUSER.DAT", 18 * MB],
          ],
        ],
        ["Public", 0, files("shared", "dat", 12, 0.2 * GB)],
      ],
    ],
    [
      "Program Files",
      0,
      [
        ["Adobe", 0, files("component", "dll", 240, 14 * GB)],
        ["JetBrains", 0, files("lib", "jar", 180, 5.2 * GB)],
        ["Microsoft Office", 0, files("office", "dll", 400, 4.1 * GB)],
        ["NVIDIA Corporation", 0, files("driver", "dll", 90, 2.3 * GB)],
      ],
    ],
    [
      "Program Files (x86)",
      0,
      [
        [
          "Steam",
          0,
          [
            [
              "steamapps",
              0,
              [
                [
                  "common",
                  0,
                  [
                    ["Cyberpunk 2077", 0, files("archive", "archive", 120, 71 * GB)],
                    ["Baldurs Gate 3", 0, files("data", "pak", 80, 122 * GB)],
                    ["Counter-Strike 2", 0, files("pak01_", "vpk", 200, 34 * GB)],
                  ],
                ],
              ],
            ],
          ],
        ],
      ],
    ],
    [
      "Windows",
      0,
      [
        ["System32", 0, files("sys", "dll", 2500, 9.8 * GB)],
        ["WinSxS", 0, files("pkg", "manifest", 1500, 12.4 * GB)],
        ["Installer", 0, files("inst", "msi", 200, 8.6 * GB)],
      ],
    ],
    ["ProgramData", 0, files("data", "bin", 300, 11 * GB)],
    ["pagefile.sys", 24 * GB],
    ["hiberfil.sys", 12.7 * GB],
    ["swapfile.sys", 16 * MB],
  ];
}

function folderSpec(): Spec[] {
  return [
    ["src", 0, files("module", "ts", 180, 12 * MB)],
    ["node_modules", 0, files("package", "js", 2400, 480 * MB)],
    ["dist", 0, files("chunk", "js", 40, 18 * MB)],
    ["package.json", 2400],
    ["README.md", 9100],
  ];
}

const scans: MockScan[] = [];
let activeScanId: string | null = null;
let nextScanNumber = 1;

function buildScan(rootPath: string, spec: Spec[], createdAt: number, elapsedMs: number): MockScan {
  const nodes: MockNode[] = [];
  let fileCount = 0;
  let dirCount = 0;

  function add(parent: number | null, [name, size, children]: Spec): number {
    const id = nodes.length;
    const kind = children ? "directory" : "file";
    nodes.push({ parent_id: parent, name, kind, size: Math.round(size), children: [], denied: 0 });
    if (children) {
      dirCount++;
      let total = 0;
      for (const child of children) {
        const childId = add(id, child);
        nodes[id].children.push(childId);
        total += nodes[childId].size;
      }
      nodes[id].size = total;
      nodes[id].children.sort((a, b) => nodes[b].size - nodes[a].size);
    } else {
      fileCount++;
    }
    return id;
  }

  const rootId = add(null, [rootPath, 0, spec]);
  if (nodes.length > 3) nodes[3].denied = 4;

  const id = `mock-${nextScanNumber++}`;
  return {
    createdAt,
    nodes,
    result: {
      scan_id: id,
      root_path: rootPath,
      root_id: rootId,
      total_size: nodes[rootId].size,
      file_count: fileCount,
      dir_count: dirCount,
      elapsed_ms: elapsedMs,
    },
  };
}

function specFor(path: string): Spec[] {
  return /^[a-z]:\\?$/i.test(path) ? driveSpec() : folderSpec();
}

if (!params.has("empty")) {
  const now = Date.now();
  scans.push(buildScan("D:\\Projects\\website", folderSpec(), now - 26 * 3600_000, 1_900));
  scans.push(buildScan("C:\\", driveSpec(), now - 12 * 60_000, 8_400));
  activeScanId = scans[scans.length - 1].result.scan_id;
}

function activeScan(): MockScan {
  const scan = scans.find((s) => s.result.scan_id === activeScanId);
  if (!scan) throw "No active scan";
  return scan;
}

function toDto(scan: MockScan, id: number): ScanNode {
  const node = scan.nodes[id];
  return {
    id,
    parent_id: node.parent_id,
    name: node.name,
    kind: node.kind,
    size_bytes: node.size,
    direct_size_bytes: node.kind === "file" ? node.size : 0,
    child_count: node.children.length,
    errors: { denied: node.denied, missing: 0, symlinks: 0, other: 0 },
  };
}

function nodePath(scan: MockScan, id: number): string {
  const parts: string[] = [];
  for (let cur: number | null = id; cur !== null; cur = scan.nodes[cur].parent_id) {
    parts.unshift(scan.nodes[cur].name);
  }
  return parts.join("\\").replace(/\\\\/g, "\\");
}

function historyItem(scan: MockScan): ScanHistoryItem {
  return { ...scan.result, created_at_ms: scan.createdAt };
}

// ---------------------------------------------------------------------------
// Events (handled here rather than with `shouldMockEvents`, whose unlisten ignores the id)

const listeners = new Map<string, Set<number>>();

function emit(event: string, payload: unknown) {
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__: { runCallback: (id: number, data: unknown) => void };
    }
  ).__TAURI_INTERNALS__;
  for (const handler of listeners.get(event) ?? []) {
    internals.runCallback(handler, { event, id: handler, payload });
  }
}

let scanTimer: number | undefined;

function simulateScan(path: string) {
  const durationMs = /^[a-z]:\\?$/i.test(path) ? 9_000 : 2_500;
  const scan = buildScan(path, specFor(path), Date.now(), durationMs);
  const known = path.toUpperCase().startsWith("D:");
  const started = Date.now();

  scanTimer = window.setInterval(() => {
    const t = Math.min(1, (Date.now() - started) / durationMs);
    const eased = 1 - (1 - t) ** 2;
    const progress: ScanProgress = {
      ratio: eased,
      scanned_directories: Math.round(scan.result.dir_count * eased),
      pending_directories: Math.round(40 * (1 - t)),
      scanned_bytes: Math.round(scan.result.total_size * eased),
      target_bytes: known ? scan.result.total_size : null,
    };
    emit("scan-progress", progress);

    if (t >= 1) {
      window.clearInterval(scanTimer);
      scanTimer = undefined;
      scans.push(scan);
      while (scans.length > 12) scans.shift();
      activeScanId = scan.result.scan_id;
      emit("scan-complete", scan.result);
    }
  }, 120);
}

// ---------------------------------------------------------------------------

const updateAvailable = params.has("update");

mockIPC(async (cmd, args) => {
  const a = (args ?? {}) as Record<string, unknown>;
  await new Promise((resolve) => setTimeout(resolve, 30));

  switch (cmd) {
    case "plugin:event|listen": {
      const set = listeners.get(a.event as string) ?? new Set();
      set.add(a.handler as number);
      listeners.set(a.event as string, set);
      return a.handler;
    }
    case "plugin:event|unlisten":
      listeners.get(a.event as string)?.delete(a.eventId as number);
      return null;

    case "list_volumes":
      return volumes;
    case "list_scan_history":
      return [...scans].reverse().map(historyItem);
    case "is_scanning":
      return scanTimer !== undefined;
    case "get_scan_result":
      return activeScan().result;
    case "activate_scan": {
      const scan = scans.find((s) => s.result.scan_id === a.id);
      if (!scan) throw "Scan not found";
      activeScanId = scan.result.scan_id;
      return scan.result;
    }
    case "delete_scan": {
      const index = scans.findIndex((s) => s.result.scan_id === a.id);
      if (index >= 0) scans.splice(index, 1);
      if (activeScanId === a.id) {
        activeScanId = scans.length ? scans[scans.length - 1].result.scan_id : null;
      }
      return null;
    }
    case "start_scan":
      if (scanTimer !== undefined) throw "A scan is already running";
      simulateScan(a.path as string);
      return null;
    case "get_children": {
      const scan = activeScan();
      const node = scan.nodes[a.nodeId as number];
      if (!node) throw "Node not found";
      return node.children.map((id) => toDto(scan, id));
    }
    case "get_node_path":
      return nodePath(activeScan(), a.nodeId as number);
    case "reveal_in_finder":
      console.info("[mock] reveal", a.path);
      return null;

    case "plugin:dialog|open":
      return "D:\\Projects\\website";
    case "plugin:updater|check":
      return updateAvailable
        ? { rid: 1, currentVersion: "0.2.7", version: "0.3.0", date: null, body: "", rawJson: {} }
        : null;
    case "plugin:updater|download":
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return null;
    case "plugin:resources|close":
      return null;
  }

  console.warn("[mock] unhandled command", cmd, args);
  return null;
});
