import { createFileRoute, Link } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { type FileListHandle, FileList, type SortState, sortNodes } from "@/components/file-list";
import {
  ArrowUpIcon,
  ChevronRightIcon,
  EllipsisIcon,
  FolderOpenIcon,
  RefreshIcon,
} from "@/components/icons";
import { Toolbar, ToolbarSpacer } from "@/components/toolbar";
import { Treemap } from "@/components/treemap";
import { Button, buttonVariants } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useNow } from "@/hooks/use-now";
import {
  formatBytes,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelativeTime,
} from "@/lib/format";
import { pathTitle, revealLabel } from "@/lib/paths";
import { useScanStore } from "@/lib/scan-store";
import type { ScanNode, ScanResult } from "@/types";

export const Route = createFileRoute("/results")({
  component: ResultsPage,
});

function ResultsPage() {
  const { result } = useScanStore();

  if (!result) {
    return (
      <>
        <Toolbar>
          <ToolbarSpacer />
        </Toolbar>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-muted-foreground">No scan is open.</p>
          <Link to="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Go to Overview
          </Link>
        </div>
      </>
    );
  }

  return <ResultsView key={result.scan_id} result={result} />;
}

interface Crumb {
  id: number;
  name: string;
  size: number;
}

const DEFAULT_SORT: SortState = { key: "size", direction: "desc" };

function ResultsView({ result }: { result: ScanResult }) {
  const { volumes, history, scanning, startScan } = useScanStore();
  const now = useNow(30_000);
  const rootTitle = pathTitle(result.root_path, volumes);

  const [crumbs, setCrumbs] = useState<Crumb[]>(() => [
    { id: result.root_id, name: rootTitle, size: result.total_size },
  ]);
  const [children, setChildren] = useState<ScanNode[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const listRef = useRef<FileListHandle>(null);

  const current = crumbs[crumbs.length - 1];
  const isRoot = crumbs.length === 1;
  const folderName = isRoot ? rootTitle : current.name;

  // Load the current folder, keeping the previous one on screen until it arrives.
  useEffect(() => {
    let cancelled = false;
    invoke<ScanNode[]>("get_children", { nodeId: current.id })
      .then((nodes) => {
        if (!cancelled) setChildren(nodes);
      })
      .catch((err) => {
        if (!cancelled) toast.error(`Couldn't open this folder: ${err}`);
      });
    return () => {
      cancelled = true;
    };
  }, [current.id]);

  useEffect(() => {
    listRef.current?.focus();
  }, []);

  const sorted = useMemo(() => (children ? sortNodes(children, sort) : []), [children, sort]);

  const openFolder = useCallback((node: ScanNode) => {
    if (node.kind !== "directory") return;
    setCrumbs((prev) => [...prev, { id: node.id, name: node.name, size: node.size_bytes }]);
    setSelectedId(null);
    setHighlightedId(null);
  }, []);

  /** Goes back to `crumbs[index]`, selecting the folder we came out of. */
  const goTo = useCallback(
    (index: number) => {
      if (index >= crumbs.length - 1) return;
      setSelectedId(crumbs[index + 1].id);
      setCrumbs(crumbs.slice(0, index + 1));
      setHighlightedId(null);
    },
    [crumbs],
  );

  const goUp = useCallback(() => goTo(crumbs.length - 2), [crumbs.length, goTo]);

  const reveal = useCallback(async (nodeId: number) => {
    try {
      const path = await invoke<string>("get_node_path", { nodeId });
      await invoke("reveal_in_finder", { path });
    } catch (err) {
      toast.error(`Couldn't open the file manager: ${err}`);
    }
  }, []);

  // The mouse "back" button goes up a level instead of leaving the results.
  useEffect(() => {
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 3 || isRoot) return;
      event.preventDefault();
      goUp();
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [goUp, isRoot]);

  const createdAt = history.find((item) => item.scan_id === result.scan_id)?.created_at_ms;
  const summary = isRoot
    ? [
        formatBytes(result.total_size),
        `${formatNumber(result.file_count)} files`,
        `${formatNumber(result.dir_count)} folders`,
        createdAt
          ? `Scanned ${formatRelativeTime(createdAt, now).toLowerCase()} in ${formatDuration(result.elapsed_ms)}`
          : `Scanned in ${formatDuration(result.elapsed_ms)}`,
      ]
    : [
        formatBytes(current.size),
        children ? `${formatNumber(children.length)} items` : null,
        `${formatPercent(result.total_size > 0 ? current.size / result.total_size : 0)} of ${rootTitle}`,
      ];

  return (
    <>
      <Toolbar className="gap-1 pl-2">
        <Button
          variant="ghost"
          size="icon"
          disabled={isRoot}
          onClick={goUp}
          aria-label="Up one level"
          title="Up one level (Backspace)"
        >
          <ArrowUpIcon />
        </Button>
        <Breadcrumbs crumbs={crumbs} rootTitle={rootTitle} onNavigate={goTo} />
        <ToolbarSpacer />
        <Button
          variant="outline"
          size="lg"
          disabled={scanning !== null}
          title={
            scanning ? "Wait for the current scan to finish" : `Scan ${result.root_path} again`
          }
          onClick={() => void startScan(result.root_path)}
        >
          <RefreshIcon />
          Rescan
        </Button>
      </Toolbar>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-start gap-4 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-semibold" title={folderName}>
              {folderName}
            </h1>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground tabular-nums">
              {summary.filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button variant="ghost" size="lg" onClick={() => void reveal(current.id)}>
            <FolderOpenIcon />
            {revealLabel}
          </Button>
        </div>

        <div className="h-[42%] min-h-36 shrink-0 px-5" aria-busy={children === null}>
          {children && (
            <Treemap
              nodes={children}
              total={current.size}
              folderName={folderName}
              highlightedId={highlightedId}
              selectedId={selectedId}
              onHighlight={setHighlightedId}
              onSelect={(node) => setSelectedId(node.id)}
              onOpen={openFolder}
            />
          )}
        </div>

        <div className="mt-3 min-h-0 flex-1 border-t">
          <FileList
            ref={listRef}
            nodes={sorted}
            total={current.size}
            folderName={folderName}
            sort={sort}
            onSortChange={setSort}
            selectedId={selectedId}
            highlightedId={highlightedId}
            onSelect={setSelectedId}
            onHighlight={setHighlightedId}
            onOpen={openFolder}
            onReveal={(node) => void reveal(node ? node.id : current.id)}
            onUp={goUp}
          />
        </div>
      </div>
    </>
  );
}

function Breadcrumbs({
  crumbs,
  rootTitle,
  onNavigate,
}: {
  crumbs: Crumb[];
  rootTitle: string;
  onNavigate: (index: number) => void;
}) {
  // Long paths keep the root and the last two folders; the middle goes in a menu.
  const collapsed = crumbs.length > 4;
  const hidden = collapsed ? crumbs.slice(1, -2) : [];
  const visible = collapsed
    ? [0, crumbs.length - 2, crumbs.length - 1]
    : crumbs.map((_, index) => index);

  return (
    <nav aria-label="Folder path" className="min-w-0">
      <ol className="flex min-w-0 items-center">
        {visible.map((index, position) => {
          const crumb = crumbs[index];
          const last = index === crumbs.length - 1;
          const name = index === 0 ? rootTitle : crumb.name;
          return (
            <Fragment key={crumb.id}>
              {position > 0 && <Separator />}
              {collapsed && position === 1 && (
                <>
                  <li className="shrink-0">
                    <Menu>
                      <MenuTrigger
                        aria-label="Show hidden folders"
                        className="flex h-7 items-center rounded-md px-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted"
                      >
                        <EllipsisIcon />
                      </MenuTrigger>
                      <MenuContent>
                        {hidden.map((item, offset) => (
                          <MenuItem key={item.id} onClick={() => onNavigate(offset + 1)}>
                            {item.name}
                          </MenuItem>
                        ))}
                      </MenuContent>
                    </Menu>
                  </li>
                  <Separator />
                </>
              )}
              <li className={last ? "min-w-0" : "min-w-0 shrink"}>
                {last ? (
                  <span
                    aria-current="page"
                    className="block truncate px-1.5 font-medium"
                    title={name}
                    data-tauri-drag-region
                  >
                    {name}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate(index)}
                    title={name}
                    className="block h-7 max-w-44 truncate rounded-md px-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {name}
                  </button>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

function Separator() {
  return (
    <li aria-hidden="true" className="shrink-0 text-muted-foreground/60">
      <ChevronRightIcon className="size-3.5" />
    </li>
  );
}
