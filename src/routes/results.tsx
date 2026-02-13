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
import type { ScanNode, ScanProgress, ScanResult } from "@/types";

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
	const [currentChildren, setCurrentChildren] = useState<ScanNode[]>([]);
	const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
	const unlistenRefs = useRef<Array<() => void>>([]);

	// Listen for scan events
	useEffect(() => {
		const setup = async () => {
			const unProgress = await listen<ScanProgress>(
				"scan-progress",
				(event) => {
					setProgress(event.payload);
				},
			);

			const unComplete = await listen<ScanResult>(
				"scan-complete",
				async (event) => {
					setScanning(false);
					setScanResult(event.payload);
					// Load root children inline to avoid stale closure
					try {
						const children = await invoke<ScanNode[]>("get_children", {
							nodeId: event.payload.root_id,
						});
						setCurrentChildren(children);
						setBreadcrumb([
							{ id: event.payload.root_id, name: event.payload.root_path },
						]);
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
		};

		setup();

		return () => {
			for (const unsub of unlistenRefs.current) {
				unsub();
			}
		};
	}, []);

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
		<div className="flex h-full flex-col overflow-hidden bg-background">
			{/* Header */}
			<header className="z-10 flex h-16 shrink-0 items-center justify-between border-white/5 border-b bg-card/30 px-6 backdrop-blur-md">
				<div className="flex items-center gap-4 overflow-hidden">
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={goHome}
						className="rounded-full text-muted-foreground hover:bg-white/5 hover:text-primary"
					>
						<svg
							aria-hidden="true"
							width="20"
							height="20"
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
					<nav className="mask-linear-fade flex items-center gap-1 overflow-hidden text-sm">
						{breadcrumb.map((crumb, i) => (
							<span key={crumb.id} className="flex shrink-0 items-center gap-1">
								{i > 0 && (
									<svg
										aria-hidden="true"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										className="text-muted-foreground/40"
									>
										<path d="m9 18 6-6-6-6" />
									</svg>
								)}
								<button
									type="button"
									onClick={() => navigateBreadcrumb(i)}
									className={`max-w-[200px] truncate rounded-md px-2 py-1 transition-all ${
										i === breadcrumb.length - 1
											? "bg-white/5 font-semibold text-foreground shadow-sm ring-1 ring-white/10"
											: "text-muted-foreground hover:bg-white/5 hover:text-primary"
									}`}
								>
									{crumb.name}
								</button>
							</span>
						))}
					</nav>
				</div>

				{/* Summary stats */}
				<div className="hidden items-center gap-6 rounded-full border border-white/5 bg-white/5 px-5 py-2 font-mono text-muted-foreground text-xs shadow-sm lg:flex">
					<div className="flex gap-2">
						<span className="font-bold text-primary">
							{formatBytes(scanResult.total_size)}
						</span>
						<span>total</span>
					</div>
					<div className="h-3 w-px bg-white/10" />
					<div className="flex gap-2">
						<span className="text-foreground">
							{formatNumber(scanResult.file_count)}
						</span>
						<span>files</span>
					</div>
					<div className="h-3 w-px bg-white/10" />
					<div className="flex gap-2">
						<span className="text-foreground">
							{formatNumber(scanResult.dir_count)}
						</span>
						<span>dirs</span>
					</div>
					<div className="h-3 w-px bg-white/10" />
					<div className="text-muted-foreground/70">
						{formatDuration(scanResult.elapsed_ms)}
					</div>
				</div>
			</header>

			{/* Main content */}
			<div className="flex flex-1 overflow-hidden">
				{/* Treemap panel */}
				<div className="min-w-0 flex-1 p-4">
					<div className="group relative h-full w-full overflow-hidden rounded-2xl border border-white/5 bg-card/20 shadow-2xl backdrop-blur-sm">
						<div className="pointer-events-none absolute inset-0" />
						<SizeTreemap nodes={currentChildren} onDrillDown={drillDown} />
					</div>
				</div>

				{/* Tree panel */}
				<div className="z-20 flex w-96 shrink-0 flex-col overflow-hidden border-white/5 border-l bg-card/10 shadow-xl backdrop-blur-md">
					<div className="flex items-center justify-between border-white/5 border-b bg-white/[0.02] px-5 py-4">
						<span className="font-medium text-foreground text-sm tracking-wide">
							Contents
						</span>
						<span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 font-medium font-mono text-primary text-xs">
							{currentChildren.length} items
						</span>
					</div>
					<ScrollArea className="flex-1">
						<FolderTree rootChildren={currentChildren} onNavigate={drillDown} />
					</ScrollArea>
				</div>
			</div>
		</div>
	);
}
