import { useCallback, useMemo } from "react";
import { ResponsiveContainer, Treemap } from "recharts";
import { formatBytes } from "@/lib/format";
import type { ScanNode } from "@/types";

interface SizeTreemapProps {
	nodes: ScanNode[];
	onDrillDown: (node: ScanNode) => void;
}

// Updated palette using CSS variables for consistency
const COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
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
		const MAX_ITEMS = 30; // Increased slightly
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
				color: "var(--muted)", // Use muted color for "others"
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
			<div className="flex h-full items-center justify-center font-medium text-muted-foreground text-sm">
				No data to display
			</div>
		);
	}

	return (
		<ResponsiveContainer width="100%" height="100%">
			<Treemap
				data={data}
				dataKey="size"
				aspectRatio={16 / 9}
				stroke="transparent"
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
	const showLabel = width > 60 && height > 35;
	const showSize = width > 70 && height > 50;

	// Add a small gap between cells
	const gap = 2;
	const adjustedX = x + gap / 2;
	const adjustedY = y + gap / 2;
	const adjustedWidth = Math.max(0, width - gap);
	const adjustedHeight = Math.max(0, height - gap);

	return (
		<g>
			<rect
				x={adjustedX}
				y={adjustedY}
				width={adjustedWidth}
				height={adjustedHeight}
				fill={color}
				rx={6}
				ry={6}
				style={{
					cursor: isClickable ? "pointer" : "default",
					transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
					filter: "brightness(0.9)",
				}}
				className="hover:z-10 hover:shadow-lg hover:brightness-110"
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
			{/* Folder Icon Overlay for directories */}
			{kind === "directory" && width > 40 && height > 40 && (
				<text
					x={adjustedX + adjustedWidth - 14}
					y={adjustedY + 14}
					fill="white"
					fillOpacity={0.3}
					textAnchor="end"
					dominantBaseline="hanging"
					fontSize={12}
					style={{ pointerEvents: "none" }}
				>
					ExampleIcon
				</text>
				// Note: SVG icon in SVG text is tricky, simpler to just use color coding or subtle indicators
			)}

			{showLabel && (
				<>
					<text
						x={adjustedX + 8}
						y={adjustedY + 20}
						fill="white"
						stroke="none"
						fontSize={12}
						fontWeight={600}
						style={{
							pointerEvents: "none",
							textShadow: "0 1px 2px rgba(0,0,0,0.3)",
						}}
						clipPath={`inset(0 0 0 0)`}
					>
						{truncateText(`${name ?? ""}`, adjustedWidth - 16, 12)}
					</text>
					{showSize && (
						<text
							x={adjustedX + 8}
							y={adjustedY + 36}
							fill="white"
							fillOpacity={0.8}
							stroke="none"
							fontSize={11}
							fontFamily="monospace"
							style={{
								pointerEvents: "none",
								textShadow: "0 1px 2px rgba(0,0,0,0.3)",
							}}
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
