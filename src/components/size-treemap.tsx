import { useCallback, useMemo } from "react";
import { ResponsiveContainer, Treemap } from "recharts";
import { formatBytes } from "@/lib/format";
import type { ScanNode } from "@/types";

interface SizeTreemapProps {
	nodes: ScanNode[];
	onDrillDown: (node: ScanNode) => void;
}

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

		const MAX_ITEMS = 30;
		const sorted = [...nodes].sort((a, b) => b.size_bytes - a.size_bytes);
		const top = sorted.slice(0, MAX_ITEMS);
		const rest = sorted.slice(MAX_ITEMS);

		const items: TreemapEntry[] = top.map((node, i) => ({
			name: node.name,
			size: Math.max(node.size_bytes, 1),
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
				color: "var(--muted)",
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
				rx={5}
				ry={5}
				style={{
					cursor: isClickable ? "pointer" : "default",
					transition: "filter 0.15s ease",
					filter: "brightness(0.85) saturate(0.9)",
				}}
				className="hover:brightness-110"
				onMouseEnter={(e) => {
					(e.target as SVGRectElement).style.filter =
						"brightness(1.0) saturate(1.0)";
				}}
				onMouseLeave={(e) => {
					(e.target as SVGRectElement).style.filter =
						"brightness(0.85) saturate(0.9)";
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
						x={adjustedX + 8}
						y={adjustedY + 18}
						fill="white"
						stroke="none"
						fontSize={11}
						fontWeight={500}
						fontFamily="'Outfit', sans-serif"
						style={{
							pointerEvents: "none",
							textShadow: "0 1px 3px rgba(0,0,0,0.5)",
						}}
					>
						{truncateText(`${name ?? ""}`, adjustedWidth - 16, 11)}
					</text>
					{showSize && (
						<text
							x={adjustedX + 8}
							y={adjustedY + 33}
							fill="white"
							fillOpacity={0.7}
							stroke="none"
							fontSize={10}
							fontFamily="'JetBrains Mono', monospace"
							style={{
								pointerEvents: "none",
								textShadow: "0 1px 3px rgba(0,0,0,0.5)",
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
