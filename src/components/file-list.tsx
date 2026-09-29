import {
  type KeyboardEvent,
  type Ref,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { ArrowDownIcon, ArrowUpIcon, FileIcon, FolderFilledIcon } from "@/components/icons";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { formatBytes, formatNumber, formatPercent } from "@/lib/format";
import { revealLabel } from "@/lib/paths";
import { cn } from "@/lib/utils";
import type { ScanNode } from "@/types";

const ROW_HEIGHT = 32;
const OVERSCAN = 8;

export type SortKey = "name" | "size" | "items";
export interface SortState {
  key: SortKey;
  direction: "asc" | "desc";
}

export function sortNodes(nodes: ScanNode[], sort: SortState): ScanNode[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  const items = (node: ScanNode) => (node.kind === "directory" ? node.child_count : -1);
  return [...nodes].sort((a, b) => {
    const primary =
      sort.key === "name"
        ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
        : sort.key === "items"
          ? items(a) - items(b)
          : a.size_bytes - b.size_bytes;
    return primary * sign || b.size_bytes - a.size_bytes || a.name.localeCompare(b.name);
  });
}

export interface FileListHandle {
  focus: () => void;
}

interface FileListProps {
  ref?: Ref<FileListHandle>;
  /** Already sorted. */
  nodes: ScanNode[];
  /** Size of the folder being listed, for the share column. */
  total: number;
  folderName: string;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  selectedId: number | null;
  highlightedId: number | null;
  onSelect: (id: number) => void;
  onHighlight: (id: number | null) => void;
  onOpen: (node: ScanNode) => void;
  onReveal: (node: ScanNode | null) => void;
  onUp: () => void;
}

const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_84px_128px] gap-x-3 @2xl:grid-cols-[minmax(0,1fr)_84px_128px_72px]";

export function FileList({
  ref,
  nodes,
  total,
  folderName,
  sort,
  onSortChange,
  selectedId,
  highlightedId,
  onSelect,
  onHighlight,
  onOpen,
  onReveal,
  onUp,
}: FileListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [menuTarget, setMenuTarget] = useState<ScanNode | null>(null);

  useImperativeHandle(
    ref,
    () => ({ focus: () => scrollRef.current?.focus({ preventScroll: true }) }),
    [],
  );

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Keep the selected row in view; otherwise start new folders at the top.
  const selectedIndex =
    selectedId === null ? -1 : nodes.findIndex((node) => node.id === selectedId);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (selectedIndex < 0) {
      element.scrollTop = 0;
      return;
    }
    const top = selectedIndex * ROW_HEIGHT;
    if (top < element.scrollTop) {
      element.scrollTop = top;
    } else if (top + ROW_HEIGHT > element.scrollTop + element.clientHeight) {
      element.scrollTop = top + ROW_HEIGHT - element.clientHeight;
    }
  }, [nodes, selectedIndex]);

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(nodes.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  const pageSize = Math.max(1, Math.floor(viewport / ROW_HEIGHT) - 1);

  const moveTo = (index: number) => {
    if (nodes.length === 0) return;
    onSelect(nodes[Math.max(0, Math.min(nodes.length - 1, index))].id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const selected = selectedIndex >= 0 ? nodes[selectedIndex] : null;
    switch (event.key) {
      case "ArrowDown":
        moveTo(selectedIndex + 1);
        break;
      case "ArrowUp":
        if (event.altKey) onUp();
        else moveTo(selectedIndex < 0 ? 0 : selectedIndex - 1);
        break;
      case "PageDown":
        moveTo(selectedIndex + pageSize);
        break;
      case "PageUp":
        moveTo(selectedIndex - pageSize);
        break;
      case "Home":
        moveTo(0);
        break;
      case "End":
        moveTo(nodes.length - 1);
        break;
      case "Enter":
        if (selected) activate(selected);
        break;
      case "Backspace":
        onUp();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const activate = (node: ScanNode) => {
    if (node.kind === "directory") onOpen(node);
    else onReveal(node);
  };

  const nodeFromEvent = (target: EventTarget | null): ScanNode | null => {
    const row = (target as HTMLElement | null)?.closest<HTMLElement>("[data-id]");
    if (!row) return null;
    const id = Number(row.dataset.id);
    return nodes.find((node) => node.id === id) ?? null;
  };

  const toggleSort = (key: SortKey) => {
    if (sort.key === key) {
      onSortChange({ key, direction: sort.direction === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ key, direction: key === "name" ? "asc" : "desc" });
    }
  };

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <div
        className={cn(
          COLUMNS,
          "h-8 shrink-0 items-center overflow-y-hidden border-b px-4 text-[12px] font-medium text-muted-foreground [scrollbar-gutter:stable]",
        )}
      >
        <SortHeader label="Name" sortKey="name" sort={sort} onToggle={toggleSort} />
        <SortHeader label="Size" sortKey="size" sort={sort} onToggle={toggleSort} align="end" />
        <span className="pl-1">Share</span>
        <SortHeader
          label="Items"
          sortKey="items"
          sort={sort}
          onToggle={toggleSort}
          align="end"
          className="hidden @2xl:flex"
        />
      </div>

      <ContextMenu>
        <ContextMenuTrigger
          className="min-h-0 flex-1"
          onContextMenu={(event) => {
            const node = nodeFromEvent(event.target);
            setMenuTarget(node);
            if (node) onSelect(node.id);
          }}
        >
          <div
            ref={scrollRef}
            role="listbox"
            tabIndex={0}
            aria-label={`Contents of ${folderName}`}
            aria-activedescendant={selectedIndex >= 0 ? `node-${selectedId}` : undefined}
            onKeyDown={onKeyDown}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            onPointerLeave={() => onHighlight(null)}
            className="h-full overflow-y-auto outline-none [scrollbar-gutter:stable] focus-visible:ring-1 focus-visible:ring-ring/60 focus-visible:ring-inset"
          >
            {nodes.length === 0 ? (
              <p className="px-4 py-6 text-center text-muted-foreground">This folder is empty.</p>
            ) : (
              <div className="relative" style={{ height: nodes.length * ROW_HEIGHT }}>
                {nodes.slice(first, last).map((node, offset) => (
                  <Row
                    key={node.id}
                    node={node}
                    index={first + offset}
                    total={total}
                    selected={node.id === selectedId}
                    highlighted={node.id === highlightedId}
                    onPointerEnter={() => onHighlight(node.id)}
                    onClick={() => onSelect(node.id)}
                    onDoubleClick={() => activate(node)}
                  />
                ))}
              </div>
            )}
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent>
          {menuTarget?.kind === "directory" && (
            <ContextMenuItem onClick={() => onOpen(menuTarget)}>Open</ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => onReveal(menuTarget)}>
            {menuTarget ? revealLabel : `${revealLabel} (this folder)`}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onToggle,
  align = "start",
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onToggle: (key: SortKey) => void;
  align?: "start" | "end";
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.direction === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      aria-label={`Sort by ${label.toLowerCase()}`}
      aria-pressed={active}
      className={cn(
        "flex h-6 items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        align === "end" && "justify-end",
        active && "text-foreground",
        className,
      )}
    >
      {label}
      {active && <Arrow className="size-3" />}
    </button>
  );
}

function Row({
  node,
  index,
  total,
  selected,
  highlighted,
  onPointerEnter,
  onClick,
  onDoubleClick,
}: {
  node: ScanNode;
  index: number;
  total: number;
  selected: boolean;
  highlighted: boolean;
  onPointerEnter: () => void;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const isFolder = node.kind === "directory";
  const share = total > 0 ? node.size_bytes / total : 0;

  return (
    <div
      id={`node-${node.id}`}
      data-id={node.id}
      role="option"
      aria-selected={selected}
      onPointerEnter={onPointerEnter}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        COLUMNS,
        "absolute inset-x-0 items-center px-4",
        selected ? "bg-selection" : highlighted && "bg-accent",
      )}
      style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
    >
      <span className="flex min-w-0 items-center gap-2">
        {isFolder ? (
          <FolderFilledIcon className="size-4 shrink-0 text-tile-folder" />
        ) : (
          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate" title={node.name}>
          {node.name}
        </span>
      </span>
      <span className="text-right tabular-nums">{formatBytes(node.size_bytes)}</span>
      <span className="flex items-center gap-2 pl-1">
        <span
          className={cn(
            "h-1.5 flex-1 overflow-hidden rounded-full",
            isFolder ? "bg-tile-folder/15" : "bg-tile-file/20",
          )}
        >
          <span
            className={cn(
              "block h-full rounded-full",
              isFolder ? "bg-tile-folder" : "bg-tile-file",
            )}
            style={{ width: `${Math.min(100, share * 100)}%` }}
          />
        </span>
        <span className="w-10 text-right text-[12px] text-muted-foreground tabular-nums">
          {formatPercent(share)}
        </span>
      </span>
      <span className="hidden text-right text-muted-foreground tabular-nums @2xl:block">
        {isFolder ? formatNumber(node.child_count) : "—"}
      </span>
    </div>
  );
}
