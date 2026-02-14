import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FolderTree } from "@/components/folder-tree";
import { ScanProgressDisplay } from "@/components/scan-progress";
import { SizeTreemap } from "@/components/size-treemap";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes, formatDuration, formatNumber } from "@/lib/format";
import type { ScanHistoryItem, ScanNode, ScanProgress, ScanResult } from "@/types";

export const Route = createFileRoute("/results")({
	component: ResultsPage,
});

interface BreadcrumbItem {
	id: number;
	name: string;
}

function ResultsPage() {
	const navigate = useNavigate();
	const [scanning, setScanning] = useState(true);
	const [progress, setProgress] = useState<ScanProgress | null>(null);
	const [scanResult, setScanResult] = useState<ScanResult | null>(null);
	const [history, setHistory] = useState<ScanHistoryItem[]>([]);
	const [activeScanId, setActiveScanId] = useState<string | null>(null);
	const [currentChildren, setCurrentChildren] = useState<ScanNode[]>([]);
	const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
	const unlistenRefs = useRef<Array<() => void>>([]);

	const clearResultView = useCallback(() => {
		setScanResult(null);
		setActiveScanId(null);
		setCurrentChildren([]);
		setBreadcrumb([]);
	}, []);

	const refreshHistory = useCallback(async () => {
		const entries = await invoke<ScanHistoryItem[]>("list_scan_history");
		setHistory(entries);
		return entries;
	}, []);

	const loadResultView = useCallback(
		async (result: ScanResult) => {
			setScanResult(result);
			setActiveScanId(result.scan_id);
			const children = await invoke<ScanNode[]>("get_children", {
				nodeId: result.root_id,
			});
			setCurrentChildren(children);
			setBreadcrumb([{ id: result.root_id, name: result.root_path }]);
		},
		[],
	);

	useEffect(() => {
		let mounted = true;

		const setup = async () => {
			const unProgress = await listen<ScanProgress>(
				"scan-progress",
				(event) => {
					setProgress(event.payload);
					setScanning(true);
				},
			);

			const unComplete = await listen<ScanResult>(
				"scan-complete",
				async (event) => {
					setScanning(false);
					try {
						await loadResultView(event.payload);
						await refreshHistory();
					} catch (err) {
						toast.error(`Failed to load: ${err}`);
					}
				},
			);

			const unError = await listen<string>("scan-error", (event) => {
				setScanning(false);
				toast.error(`Scan failed: ${event.payload}`);
			});

			unlistenRefs.current = [unProgress, unComplete, unError];

			let keepScanning = false;
			try {
				await refreshHistory();
				const currentlyScanning = await invoke<boolean>("is_scanning");
				if (!mounted) return;

				if (currentlyScanning) {
					setScanning(true);
					keepScanning = true;
					return;
				}

				try {
					const result = await invoke<ScanResult>("get_scan_result");
					if (!mounted) return;
					await loadResultView(result);
				} catch {
					if (!mounted) return;
					clearResultView();
				}
			} catch (err) {
				if (!mounted) return;
				toast.error(`Failed to load cached scans: ${err}`);
				clearResultView();
			} finally {
				if (mounted && !keepScanning) {
					setScanning(false);
				}
			}
		};

		void setup();

		return () => {
			mounted = false;
			for (const unsub of unlistenRefs.current) {
				unsub();
			}
		};
	}, [clearResultView, loadResultView, refreshHistory]);

	const openHistoryEntry = useCallback(
		async (scanId: string) => {
			try {
				const result = await invoke<ScanResult>("activate_scan", { id: scanId });
				await loadResultView(result);
			} catch (err) {
				toast.error(`Failed to load cached scan: ${err}`);
			}
		},
		[loadResultView],
	);

	const deleteHistoryEntry = useCallback(
		async (scanId: string) => {
			try {
				await invoke("delete_scan", { id: scanId });
				await refreshHistory();
				if (activeScanId !== scanId) return;
				try {
					const next = await invoke<ScanResult>("get_scan_result");
					await loadResultView(next);
				} catch {
					clearResultView();
				}
			} catch (err) {
				toast.error(`Failed to delete cached scan: ${err}`);
			}
		},
		[activeScanId, clearResultView, loadResultView, refreshHistory],
	);

	const drillDown = useCallback(async (node: ScanNode) => {
		if (node.kind !== "directory") return;
		try {
			const children = await invoke<ScanNode[]>("get_children", {
				nodeId: node.id,
			});
			setCurrentChildren(children);
			setBreadcrumb((prev) => [...prev, { id: node.id, name: node.name }]);
		} catch (err) {
			toast.error(`Failed to load: ${err}`);
		}
	}, []);

	const navigateBreadcrumb = useCallback(async (index: number) => {
		setBreadcrumb((prev) => {
			const newCrumbs = prev.slice(0, index + 1);
			const target = newCrumbs[newCrumbs.length - 1];
			invoke<ScanNode[]>("get_children", { nodeId: target.id })
				.then(setCurrentChildren)
				.catch((err) => toast.error(`Failed to navigate: ${err}`));
			return newCrumbs;
		});
	}, []);

	const goHome = useCallback(() => {
		navigate({ to: "/" });
	}, [navigate]);

	// Scanning state
	if (scanning) {
		return <ScanProgressDisplay progress={progress} />;
	}

	// No result (error case)
	if (!scanResult) {
		return (
			<div className="flex min-h-full flex-col items-center justify-center gap-4 bg-background px-6">
				<p className="text-muted-foreground text-sm">
					No scan results available
				</p>
				<Button variant="outline" onClick={goHome}>
					Back to scanner
				</Button>
			</div>
		);
	}

	return (
		<div className="page-enter flex h-full flex-col overflow-hidden bg-background">
			{/* Header */}
			<header className="z-10 flex h-12 shrink-0 items-center justify-between border-border/50 border-b bg-card/30 px-4">
				<div className="flex items-center gap-2 overflow-hidden">
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={goHome}
						className="size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<svg
							aria-hidden="true"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="m15 18-6-6 6-6" />
						</svg>
					</Button>

					{/* Breadcrumb */}
					<nav className="flex items-center gap-0.5 overflow-hidden text-sm">
						{breadcrumb.map((crumb, i) => (
							<span
								key={crumb.id}
								className="flex shrink-0 items-center gap-0.5"
							>
								{i > 0 && (
									<svg
										aria-hidden="true"
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										className="text-muted-foreground/30"
									>
										<path d="m9 18 6-6-6-6" />
									</svg>
								)}
								<button
									type="button"
									onClick={() => navigateBreadcrumb(i)}
									className={`max-w-[180px] truncate rounded-md px-1.5 py-0.5 text-xs transition-colors ${
										i === breadcrumb.length - 1
											? "font-medium text-foreground"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									{crumb.name}
								</button>
							</span>
						))}
					</nav>
				</div>

				{/* Summary stats */}
				<div className="hidden items-center gap-4 font-mono text-[11px] text-muted-foreground tabular-nums lg:flex">
					<span className="font-medium text-primary">
						{formatBytes(scanResult.total_size)}
					</span>
					<span className="text-border">|</span>
					<span>{formatNumber(scanResult.file_count)} files</span>
					<span className="text-border">|</span>
					<span>{formatNumber(scanResult.dir_count)} dirs</span>
					<span className="text-border">|</span>
					<span className="text-muted-foreground/60">
						{formatDuration(scanResult.elapsed_ms)}
					</span>
				</div>
			</header>

			{/* Main content */}
			<div className="flex flex-1 overflow-hidden">
				{/* Treemap panel */}
				<div className="min-w-0 flex-1 p-3">
					<div className="h-full w-full overflow-hidden rounded-xl border border-border/40 bg-card/20">
						<SizeTreemap nodes={currentChildren} onDrillDown={drillDown} />
					</div>
				</div>

				{/* Tree panel */}
				<div className="z-20 flex w-80 shrink-0 flex-col overflow-hidden border-border/50 border-l bg-card/20">
					<div className="border-border/40 border-b">
						<div className="flex items-center justify-between px-4 py-3">
							<span className="font-medium text-foreground text-xs tracking-wide">
								Recent Scans
							</span>
							<span className="rounded-md bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
								{history.length}
							</span>
						</div>
						<ScrollArea className="max-h-40 border-border/40 border-t">
							{history.length === 0 ? (
								<p className="px-4 py-3 text-muted-foreground text-xs">
									No cached scans yet
								</p>
							) : (
								<div className="space-y-1 p-2">
									{history.map((entry) => (
										<div
											key={entry.scan_id}
											className={`flex items-center gap-1 rounded-md border px-1.5 py-1 ${
												entry.scan_id === activeScanId
													? "border-primary/50 bg-primary/5"
													: "border-transparent"
											}`}
										>
											<button
												type="button"
												onClick={() => void openHistoryEntry(entry.scan_id)}
												className="min-w-0 flex-1 rounded px-1.5 py-1 text-left transition-colors hover:bg-muted/50"
											>
												<p
													className="truncate font-medium text-[11px]"
													title={entry.root_path}
												>
													{entry.root_path}
												</p>
												<p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
													{formatBytes(entry.total_size)} ·{" "}
													{formatDuration(entry.elapsed_ms)} ·{" "}
													{formatScanTimestamp(entry.created_at_ms)}
												</p>
											</button>
											<button
												type="button"
												onClick={() => void deleteHistoryEntry(entry.scan_id)}
												className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
												aria-label="Delete cached scan"
											>
												<svg
													aria-hidden="true"
													width="13"
													height="13"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="1.8"
													strokeLinecap="round"
													strokeLinejoin="round"
												>
													<path d="M3 6h18" />
													<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
													<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
													<path d="M10 11v6" />
													<path d="M14 11v6" />
												</svg>
											</button>
										</div>
									))}
								</div>
							)}
						</ScrollArea>
					</div>

					<div className="flex items-center justify-between border-border/40 border-b px-4 py-3">
						<span className="font-medium text-foreground text-xs tracking-wide">
							Contents
						</span>
						<span className="rounded-md bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
							{currentChildren.length}
						</span>
					</div>
					<ScrollArea className="flex-1">
						<FolderTree
							key={activeScanId ?? "empty"}
							rootChildren={currentChildren}
							onNavigate={drillDown}
						/>
					</ScrollArea>
				</div>
			</div>
		</div>
	);
}

function formatScanTimestamp(timestampMs: number): string {
	return new Date(timestampMs).toLocaleString();
}
