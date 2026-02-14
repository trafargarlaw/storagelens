import {
	createFileRoute,
	useLoaderData,
	useNavigate,
} from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { toast } from "sonner";

import { AppLogo } from "@/components/app-logo";
import { CircularProgress } from "@/components/circular-progress";
import { formatBytes } from "@/lib/format";
import type { Volume } from "@/types";

export const Route = createFileRoute("/")({
	component: ScanSetupPage,
	loader: async () => {
		const volumes = await invoke<Volume[]>("list_volumes");
		const filtered = volumes
			.filter((vol) => vol.total_bytes > 0)
			.filter((vol) => !isSystemPseudoVolume(vol.mount_point));
		const deduped = dedupeVolumes(filtered);
		deduped.sort((a, b) => b.total_bytes - a.total_bytes);
		return { volumes: deduped };
	},
});

function ScanSetupPage() {
	const { volumes } = useLoaderData({ from: "/" });
	const navigate = useNavigate();

	const startScan = useCallback(
		async (path: string) => {
			try {
				await invoke("start_scan", { path });
				navigate({ to: "/results" });
			} catch (err) {
				toast.error(`Failed to start scan: ${err}`);
			}
		},
		[navigate],
	);

	const pickFolder = useCallback(async () => {
		const selected = await open({ directory: true, multiple: false });
		if (selected) {
			void startScan(selected);
		}
	}, [startScan]);

	return (
		<div className="flex h-full flex-col bg-background">
			<div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-8 py-12">
				<div className="w-full max-w-3xl space-y-10">
					{/* Header */}
					<div className="page-enter space-y-3 text-center">
						<div className="mx-auto flex size-14 items-center justify-center">
							<AppLogo aria-hidden="true" className="size-12" />
						</div>
						<h1 className="font-semibold text-2xl tracking-tight">
							storagelens
						</h1>
						<p className="text-muted-foreground text-sm">
							Select a volume or folder to analyze
						</p>
					</div>

					{/* Volumes Grid */}
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{volumes.length === 0 ? (
							<div className="card-enter col-span-full rounded-xl border border-border/50 bg-card/40 py-10 text-center">
								<p className="text-muted-foreground text-sm">
									No volumes found
								</p>
							</div>
						) : (
							volumes.map((vol, i) => (
								<VolumeCard
									key={vol.mount_point}
									volume={vol}
									index={i}
									onScan={() => void startScan(vol.mount_point)}
								/>
							))
						)}

						{/* Scan Folder */}
						<button
							type="button"
							onClick={pickFolder}
							className="card-enter group flex flex-col items-center justify-center gap-3 rounded-xl border border-border/60 border-dashed bg-transparent p-6 transition-all duration-200 hover:border-primary/40 hover:bg-card/30"
							style={{
								animationDelay: `${volumes.length * 60 + 60}ms`,
							}}
						>
							<div className="flex size-10 items-center justify-center rounded-lg bg-muted/50 transition-colors group-hover:bg-primary/10">
								<svg
									aria-hidden="true"
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									strokeLinejoin="round"
									className="text-muted-foreground transition-colors group-hover:text-primary"
								>
									<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
									<line x1="12" y1="10" x2="12" y2="16" />
									<line x1="9" y1="13" x2="15" y2="13" />
								</svg>
							</div>
							<span className="font-medium text-muted-foreground text-sm transition-colors group-hover:text-primary">
								Choose Folder
							</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function VolumeCard({
	volume,
	index,
	onScan,
}: {
	volume: Volume;
	index: number;
	onScan: () => void;
}) {
	const usedPercent =
		volume.total_bytes > 0 ? (volume.used_bytes / volume.total_bytes) * 100 : 0;

	const displayName = volume.name || volume.mount_point;

	let usageColor = "var(--primary)";
	if (usedPercent > 90) usageColor = "var(--destructive)";
	else if (usedPercent > 70) usageColor = "var(--chart-4)";

	return (
		<button
			type="button"
			onClick={onScan}
			className="card-enter group flex flex-col justify-between gap-5 rounded-xl border border-border/50 bg-card/40 p-5 text-left transition-all duration-200 hover:border-primary/30 hover:bg-card/70"
			style={{ animationDelay: `${index * 60 + 60}ms` }}
		>
			<div className="flex w-full items-start justify-between">
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex items-center gap-2">
						<svg
							aria-hidden="true"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="shrink-0 text-primary/70"
						>
							<rect x="2" y="6" width="20" height="12" rx="2" />
							<circle cx="6" cy="12" r="1" fill="currentColor" />
						</svg>
						<h3
							className="max-w-[160px] truncate font-medium text-sm tracking-tight"
							title={displayName}
						>
							{displayName}
						</h3>
					</div>
					<p className="truncate font-mono text-[11px] text-muted-foreground">
						{volume.mount_point}
					</p>
				</div>

				<CircularProgress
					value={usedPercent}
					size={44}
					strokeWidth={3.5}
					color={usageColor}
				/>
			</div>

			<div className="w-full space-y-2">
				<div className="flex justify-between text-xs">
					<span className="text-muted-foreground">Used</span>
					<span className="font-mono text-foreground">
						{formatBytes(volume.used_bytes)}
					</span>
				</div>
				<div className="h-px w-full bg-border/50" />
				<div className="flex justify-between text-xs">
					<span className="text-muted-foreground">Total</span>
					<span className="font-mono text-foreground">
						{formatBytes(volume.total_bytes)}
					</span>
				</div>
			</div>
		</button>
	);
}

function dedupeVolumes(volumes: Volume[]): Volume[] {
	const seen = new Set<string>();
	const result: Volume[] = [];

	for (const volume of volumes) {
		const key = `${volume.name}|${volume.total_bytes}|${volume.used_bytes}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(volume);
	}

	return result;
}

function isSystemPseudoVolume(mountPoint: string): boolean {
	return mountPoint.startsWith("/System/Volumes/");
}
