import { useCallback, useMemo } from "react";
import { ResponsiveContainer, Treemap } from "recharts";
import { formatBytes } from "@/lib/format";
import type { ScanNode } from "@/types";

interface SizeTreemapProps {
	nodes: ScanNode[];
	onDrillDown: (node: ScanNode) => void;
}

// Teal-based palette that matches the app's primary color scheme
const COLORS = [
	"oklch(0.72 0.12 183)",
	"oklch(0.65 0.11 185)",
	"oklch(0.58 0.10 187)",
	"oklch(0.52 0.09 189)",
	"oklch(0.78 0.13 181)",
	"oklch(0.48 0.08 191)",
	"oklch(0.82 0.11 179)",
	"oklch(0.55 0.10 186)",
	"oklch(0.68 0.12 184)",
	"oklch(0.45 0.07 192)",
	"oklch(0.75 0.12 182)",
	"oklch(0.62 0.11 186)",
];

interface TreemapEntry {
	name: string;
	size: number;
	displaySize: string;
	nodeId: number;
	kind: string;
	color: string;
}

export function SizeTreemap({ nodes, onDrillDown }: SizeTreemapProps) {
	const nodesById = useMemo(
		() => new Map(nodes.map((node) => [node.id, node])),
		[nodes],
	);

	const data = useMemo(() => {
		if (nodes.length === 0) return [];

		// Show top items, group the rest into "Other"
		const MAX_ITEMS = 24;
		const sorted = [...nodes].sort((a, b) => b.size_bytes - a.size_bytes);
		const top = sorted.slice(0, MAX_ITEMS);
		const rest = sorted.slice(MAX_ITEMS);

		const items: TreemapEntry[] = top.map((node, i) => ({
			name: node.name,
			size: Math.max(node.size_bytes, 1), // Treemap needs > 0
			displaySize: formatBytes(node.size_bytes),
			nodeId: node.id,
			kind: node.kind,
			color: COLORS[i % COLORS.length],
		}));

		if (rest.length > 0) {
			const otherSize = rest.reduce((sum, n) => sum + n.size_bytes, 0);
			items.push({
				name: `${rest.length} other items`,
				size: Math.max(otherSize, 1),
				displaySize: formatBytes(otherSize),
				nodeId: -1,
				kind: "other",
				color: "oklch(0.35 0.02 200)",
			});
		}

		return items;
	}, [nodes]);

	const handleClick = useCallback(
		(entry: TreemapEntry) => {
			if (entry.nodeId === -1) return;
			const node = nodesById.get(entry.nodeId);
			if (node?.kind === "directory") {
				onDrillDown(node);
			}
		},
		[nodesById, onDrillDown],
	);

	if (data.length === 0) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
				No data to display
			</div>
		);
	}

	return (
		<ResponsiveContainer width="100%" height="100%">
			<Treemap
				data={data}
				dataKey="size"
				aspectRatio={4 / 3}
				isAnimationActive={false}
				animationDuration={0}
				content={<CustomTreemapCell onClick={handleClick} />}
			/>
		</ResponsiveContainer>
	);
}

interface CustomCellProps {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	name?: string;
	displaySize?: string;
	color?: string;
	kind?: string;
	nodeId?: number;
	onClick: (entry: TreemapEntry) => void;
}

function CustomTreemapCell({
	x = 0,
	y = 0,
	width = 0,
	height = 0,
	name,
	displaySize,
	color,
	kind,
	nodeId,
	onClick,
}: CustomCellProps) {
	const isClickable = kind === "directory" && nodeId !== -1;
	const showLabel = width > 50 && height > 30;
	const showSize = width > 60 && height > 44;

	return (
		<g>
			<rect
				x={x}
				y={y}
				width={width}
				height={height}
				fill={color}
				stroke="oklch(0.145 0 0 / 0.4)"
				strokeWidth={1}
				rx={4}
				ry={4}
				style={{
					cursor: isClickable ? "pointer" : "default",
					transition: "opacity 0.15s",
				}}
				opacity={0.9}
				onMouseEnter={(e) => {
					e.currentTarget.setAttribute("opacity", "1");
				}}
				onMouseLeave={(e) => {
					e.currentTarget.setAttribute("opacity", "0.9");
				}}
				onClick={() => {
					if (isClickable) {
						onClick({
							name: name ?? "",
							size: 0,
							displaySize: displaySize ?? "",
							nodeId: nodeId ?? -1,
							kind: kind ?? "",
							color: color ?? "",
						});
					}
				}}
			/>
			{showLabel && (
				<>
					<text
						x={x + 8}
						y={y + 16}
						fill="oklch(0.98 0 0)"
						stroke="none"
						fontSize={11}
						fontWeight={500}
						style={{ pointerEvents: "none" }}
					>
						{truncateText(
							`${kind === "directory" ? "" : ""}${name ?? ""}`,
							width - 16,
							11,
						)}
					</text>
					{showSize && (
						<text
							x={x + 8}
							y={y + 30}
							fill="oklch(0.98 0 0 / 0.7)"
							stroke="none"
							fontSize={10}
							style={{ pointerEvents: "none" }}
						>
							{displaySize}
						</text>
					)}
				</>
			)}
		</g>
	);
}

function truncateText(
	text: string,
	maxWidth: number,
	fontSize: number,
): string {
	const avgCharWidth = fontSize * 0.6;
	const maxChars = Math.floor(maxWidth / avgCharWidth);
	if (text.length <= maxChars) return text;
	return `${text.slice(0, Math.max(0, maxChars - 1))}...`;
}
