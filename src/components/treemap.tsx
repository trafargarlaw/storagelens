import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from "react";

import { formatBytes, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScanNode } from "@/types";

/** Beyond this many tiles the rest fold into one "smaller items" tile. */
const MAX_TILES = 40;
/** Items that would get less area than this (px²) fold in too; they'd just be slivers. */
const MIN_TILE_AREA = 24 * 24;
/** Surface gap between tiles, in px. */
const GAP = 2;

type TileKind = "directory" | "file" | "other";

interface Tile {
  key: string;
  kind: TileKind;
  node: ScanNode | null;
  name: string;
  size: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const TILE_STYLE: Record<TileKind, CSSProperties> = {
  directory: { background: "var(--tile-folder)", color: "var(--tile-folder-label)" },
  file: { background: "var(--tile-file)", color: "var(--tile-file-label)" },
  other: { background: "var(--tile-other)", color: "var(--tile-other-label)" },
};

interface TreemapProps {
  nodes: ScanNode[];
  /** Size of the folder being shown, for percentages. */
  total: number;
  folderName: string;
  highlightedId: number | null;
  selectedId: number | null;
  onHighlight: (id: number | null) => void;
  onSelect: (node: ScanNode) => void;
  onOpen: (node: ScanNode) => void;
}

/**
 * Squarified treemap of one folder's direct children. It's a pointer-only view:
 * keyboard and screen reader users get the same data from the list next to it.
 */
export function Treemap({
  nodes,
  total,
  folderName,
  highlightedId,
  selectedId,
  onHighlight,
  onSelect,
  onOpen,
}: TreemapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<{ tile: Tile; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const tiles = useMemo(() => layoutTiles(nodes, box.width, box.height), [nodes, box]);
  const shown = nodes.filter((node) => node.size_bytes > 0);

  const summary =
    shown.length === 0
      ? `${folderName} has nothing to show`
      : `Largest items in ${folderName}: ${[...shown]
          .sort((a, b) => b.size_bytes - a.size_bytes)
          .slice(0, 3)
          .map((node) => `${node.name}, ${formatBytes(node.size_bytes)}`)
          .join("; ")}`;

  const tileAt = (target: EventTarget | null): Tile | null => {
    const element = (target as HTMLElement | null)?.closest<HTMLElement>("[data-tile]");
    return element ? (tiles[Number(element.dataset.tile)] ?? null) : null;
  };

  const legend: [TileKind, string][] = [
    ["directory", "Folder"],
    ["file", "File"],
  ];
  if (tiles.some((tile) => tile.kind === "other")) legend.push(["other", "Smaller items"]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div
        ref={containerRef}
        role="img"
        aria-label={summary}
        className="relative min-h-0 w-full flex-1 overflow-hidden"
        onPointerMove={(event) => {
          const tile = tileAt(event.target);
          const rect = event.currentTarget.getBoundingClientRect();
          setHover(
            tile ? { tile, x: event.clientX - rect.left, y: event.clientY - rect.top } : null,
          );
          const id = tile?.node?.id ?? null;
          if (id !== highlightedId) onHighlight(id);
        }}
        onPointerLeave={() => {
          setHover(null);
          onHighlight(null);
        }}
        onClick={(event) => {
          const node = tileAt(event.target)?.node;
          if (!node) return;
          if (node.kind === "directory") onOpen(node);
          else onSelect(node);
        }}
      >
        {shown.length === 0 && (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed text-muted-foreground">
            {nodes.length === 0 ? "This folder is empty" : "Everything here is 0 bytes"}
          </div>
        )}

        {tiles.map((tile, index) => {
          const id = tile.node?.id;
          const highlighted = id !== undefined && id === highlightedId;
          const selected = id !== undefined && id === selectedId;
          const showName = tile.w >= 56 && tile.h >= 28;
          const showSize = showName && tile.h >= 44;
          return (
            <div
              key={tile.key}
              data-tile={index}
              className={cn(
                "absolute overflow-hidden rounded-[4px] px-2 py-1.5 leading-tight",
                tile.kind === "directory" && "cursor-pointer",
              )}
              style={{
                ...TILE_STYLE[tile.kind],
                left: tile.x,
                top: tile.y,
                width: tile.w,
                height: tile.h,
                backgroundImage: highlighted
                  ? "linear-gradient(rgb(255 255 255 / 0.16), rgb(255 255 255 / 0.16))"
                  : undefined,
                boxShadow: selected ? "inset 0 0 0 2px var(--foreground)" : undefined,
              }}
            >
              {showName && <div className="truncate text-[12px] font-medium">{tile.name}</div>}
              {showSize && (
                <div className="truncate text-[11px] tabular-nums opacity-80">
                  {formatBytes(tile.size)}
                </div>
              )}
            </div>
          );
        })}

        {hover && <TreemapTooltip {...hover} total={total} box={box} />}
      </div>

      <ul className="flex items-center gap-3 text-[12px] text-muted-foreground" aria-label="Legend">
        {legend.map(([kind, label]) => (
          <li key={kind} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[3px]"
              style={{ background: TILE_STYLE[kind].background }}
            />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TreemapTooltip({
  tile,
  x,
  y,
  total,
  box,
}: {
  tile: Tile;
  x: number;
  y: number;
  total: number;
  box: { width: number; height: number };
}) {
  const width = 240;
  const left = x + 14 + width > box.width ? Math.max(4, x - 14 - width) : x + 14;
  const top = y + 16 + 72 > box.height ? Math.max(4, y - 16 - 72) : y + 16;

  const details =
    tile.kind === "directory"
      ? `Folder · ${formatNumber(tile.node?.child_count ?? 0)} items`
      : tile.kind === "file"
        ? "File"
        : "Too small to show one by one";

  return (
    <div
      className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2.5 py-2 text-popover-foreground shadow-md"
      style={{ left, top, maxWidth: width }}
    >
      <div className="text-[13px] font-semibold tabular-nums">{formatBytes(tile.size)}</div>
      <div className="truncate">{tile.name}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground tabular-nums">
        {formatPercent(total > 0 ? tile.size / total : 0)} of this folder · {details}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout

interface Item {
  node: ScanNode | null;
  size: number;
  otherCount: number;
}

function layoutTiles(nodes: ScanNode[], width: number, height: number): Tile[] {
  if (width <= 0 || height <= 0) return [];

  const sorted = nodes
    .filter((node) => node.size_bytes > 0)
    .sort((a, b) => b.size_bytes - a.size_bytes);
  const total = sorted.reduce((sum, node) => sum + node.size_bytes, 0);
  const areaPerByte = ((width + GAP) * (height + GAP)) / total;

  let keep = Math.min(sorted.length, MAX_TILES);
  while (keep > 0 && sorted[keep - 1].size_bytes * areaPerByte < MIN_TILE_AREA) keep--;
  // Folding a single item into "1 smaller item" helps no one.
  if (sorted.length - keep === 1) keep = sorted.length;

  const items: Item[] = sorted.slice(0, keep).map((node) => ({
    node,
    size: node.size_bytes,
    otherCount: 0,
  }));
  const rest = sorted.slice(keep);
  if (rest.length > 0) {
    items.push({
      node: null,
      size: rest.reduce((sum, node) => sum + node.size_bytes, 0),
      otherCount: rest.length,
    });
    // The combined tile can outweigh the items it sits beside; squarify needs them in order.
    items.sort((a, b) => b.size - a.size);
  }

  // Lay out in a box one gap larger, then shrink every tile by the gap, so the
  // outer tiles sit flush with the edges and neighbours are GAP apart.
  const rects = squarify(
    items.map((item) => item.size),
    { x: 0, y: 0, w: width + GAP, h: height + GAP },
  );

  const tiles: Tile[] = [];
  rects.forEach((rect, index) => {
    const item = items[index];
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const w = Math.round(rect.x + rect.w) - x - GAP;
    const h = Math.round(rect.y + rect.h) - y - GAP;
    if (w < 1 || h < 1) return;
    tiles.push({
      key: item.node ? String(item.node.id) : "other",
      kind: item.node ? item.node.kind : "other",
      node: item.node,
      name: item.node
        ? item.node.name
        : `${formatNumber(item.otherCount)} ${item.otherCount === sorted.length ? "items" : "smaller items"}`,
      size: item.size,
      x,
      y,
      w,
      h,
    });
  });
  return tiles;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Squarified treemap (Bruls, Huizing & van Wijk). `values` must be sorted descending. */
function squarify(values: number[], bounds: Rect): Rect[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];

  const scale = (bounds.w * bounds.h) / total;
  const areas = values.map((value) => value * scale);
  const out: Rect[] = [];
  let free = { ...bounds };
  let row: number[] = [];

  for (let i = 0; i < areas.length;) {
    const side = Math.min(free.w, free.h);
    const candidate = [...row, areas[i]];
    if (row.length === 0 || worstRatio(candidate, side) <= worstRatio(row, side)) {
      row = candidate;
      i++;
    } else {
      free = placeRow(row, free, out);
      row = [];
    }
  }
  if (row.length > 0) placeRow(row, free, out);
  return out;
}

function worstRatio(row: number[], side: number): number {
  let sum = 0;
  let min = Infinity;
  let max = 0;
  for (const area of row) {
    sum += area;
    min = Math.min(min, area);
    max = Math.max(max, area);
  }
  const sideSq = side * side;
  const sumSq = sum * sum;
  return Math.max((sideSq * max) / sumSq, sumSq / (sideSq * min));
}

/** Places a row along the shorter side of `free` and returns the space left over. */
function placeRow(row: number[], free: Rect, out: Rect[]): Rect {
  const sum = row.reduce((acc, area) => acc + area, 0);

  if (free.w >= free.h) {
    const columnWidth = sum / free.h;
    let y = free.y;
    for (const area of row) {
      const h = area / columnWidth;
      out.push({ x: free.x, y, w: columnWidth, h });
      y += h;
    }
    return { x: free.x + columnWidth, y: free.y, w: free.w - columnWidth, h: free.h };
  }

  const rowHeight = sum / free.w;
  let x = free.x;
  for (const area of row) {
    const w = area / rowHeight;
    out.push({ x, y: free.y, w, h: rowHeight });
    x += w;
  }
  return { x: free.x, y: free.y + rowHeight, w: free.w, h: free.h - rowHeight };
}
