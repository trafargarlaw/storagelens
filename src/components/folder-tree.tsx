import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { formatBytes } from "@/lib/format";
import type { ScanNode } from "@/types";

interface FolderTreeProps {
	rootChildren: ScanNode[];
	onNavigate: (node: ScanNode) => void;
}

export function FolderTree({ rootChildren, onNavigate }: FolderTreeProps) {
	return (
		<div className="space-y-px overflow-y-auto">
			{rootChildren.map((node) => (
				<TreeRow key={node.id} node={node} depth={0} onNavigate={onNavigate} />
			))}
		</div>
	);
}

interface TreeRowProps {
	node: ScanNode;
	depth: number;
	onNavigate: (node: ScanNode) => void;
}

function TreeRow({ node, depth, onNavigate }: TreeRowProps) {
	const FAST_DOUBLE_CLICK_MS = 220;

	const [expanded, setExpanded] = useState(false);
	const [children, setChildren] = useState<ScanNode[] | null>(null);
	const [loading, setLoading] = useState(false);
	const lastClickAt = useRef(0);

	const isDir = node.kind === "directory";

	const toggle = useCallback(async () => {
		if (!isDir) return;

		if (expanded) {
			setExpanded(false);
			return;
		}

		if (children === null) {
			setLoading(true);
			try {
				const result = await invoke<ScanNode[]>("get_children", {
					nodeId: node.id,
				});
				setChildren(result);
			} catch (err) {
				toast.error(`Failed to load: ${err}`);
			} finally {
				setLoading(false);
			}
		}

		setExpanded(true);
	}, [isDir, expanded, children, node.id]);

	const revealInFinder = useCallback(async () => {
		try {
			const path = await invoke<string>("get_node_path", {
				nodeId: node.id,
			});
			await invoke("reveal_in_finder", { path });
		} catch (err) {
			toast.error(`Failed to reveal: ${err}`);
		}
	}, [node.id]);

	const handleClick = useCallback(() => {
		const now = performance.now();
		const clickDelta = now - lastClickAt.current;
		lastClickAt.current = now;

		void toggle();

		if (isDir && clickDelta <= FAST_DOUBLE_CLICK_MS) {
			onNavigate(node);
		}
	}, [isDir, node, onNavigate, toggle]);

	return (
		<div>
			<ContextMenu>
				<ContextMenuTrigger>
					<button
						type="button"
						onClick={handleClick}
						className="group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-white/5 hover:text-primary"
						style={{ paddingLeft: `${depth * 20 + 8}px` }}
					>
						{/* Expand/collapse indicator */}
						<span className="flex size-4 shrink-0 items-center justify-center">
							{isDir ? (
								loading ? (
									<span className="size-3 animate-spin rounded-full border border-muted-foreground/30 border-t-muted-foreground" />
								) : (
									<svg
										aria-hidden="true"
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										className={`text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
									>
										<path d="m9 18 6-6-6-6" />
									</svg>
								)
							) : null}
						</span>

						{/* Icon */}
						{isDir ? (
							<svg
								aria-hidden="true"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="currentColor"
								className="shrink-0 text-primary/80"
							>
								<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
							</svg>
						) : (
							<svg
								aria-hidden="true"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="shrink-0 text-muted-foreground"
							>
								<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
								<path d="M14 2v4a2 2 0 0 0 2 2h4" />
							</svg>
						)}

						{/* Name */}
						<span className="min-w-0 flex-1 truncate text-xs">{node.name}</span>

						{/* Size */}
						<span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums group-hover:text-primary/70">
							{formatBytes(node.size_bytes)}
						</span>
					</button>
				</ContextMenuTrigger>

				<ContextMenuContent>
					<ContextMenuItem onClick={revealInFinder}>
						<svg
							aria-hidden="true"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="mr-1"
						>
							<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
							<polyline points="15 3 21 3 21 9" />
							<line x1="10" x2="21" y1="14" y2="3" />
						</svg>
						Reveal in Finder
					</ContextMenuItem>
					{isDir && node.child_count > 0 && (
						<ContextMenuItem onClick={() => onNavigate(node)}>
							<svg
								aria-hidden="true"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="mr-1"
							>
								<circle cx="11" cy="11" r="8" />
								<path d="m21 21-4.3-4.3" />
								<path d="M11 8v6" />
								<path d="M8 11h6" />
							</svg>
							Open in Scanner
						</ContextMenuItem>
					)}
				</ContextMenuContent>
			</ContextMenu>

			{/* Children */}
			{expanded && children && (
				<div>
					{children.map((child) => (
						<TreeRow
							key={child.id}
							node={child}
							depth={depth + 1}
							onNavigate={onNavigate}
						/>
					))}
				</div>
			)}
		</div>
	);
}
