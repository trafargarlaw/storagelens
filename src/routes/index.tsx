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
		<div className="relative flex h-full flex-col overflow-hidden bg-background">
			<div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />

			<div className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto p-8">
				<div className="w-full max-w-5xl space-y-12">
					{/* Hero Section */}
					<div className="space-y-6 text-center">
						<div className="relative mx-auto flex size-24 items-center justify-center">
							<div className="absolute inset-0 rounded-full bg-primary/20 blur-3xl" />
							<AppLogo aria-hidden="true" className="relative z-10 size-20" />
						</div>
						<div className="space-y-2">
							<h1 className="font-bold text-4xl text-glow tracking-tight">
								Disk Scanner
							</h1>
							<p className="mx-auto max-w-md text-lg text-muted-foreground">
								Visualize your storage. Clean up space.
							</p>
						</div>
					</div>

					{/* Volumes Grid */}
					<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
						{volumes.length === 0 ? (
							<div className="col-span-full rounded-2xl border border-white/5 bg-white/[0.02] py-12 text-center">
								<p className="text-muted-foreground">No volumes found</p>
							</div>
						) : (
							volumes.map((vol) => (
								<VolumeCard
									key={vol.mount_point}
									volume={vol}
									onScan={() => void startScan(vol.mount_point)}
								/>
							))
						)}

						{/* Custom Folder Card */}
						<button
							type="button"
							onClick={pickFolder}
							className="group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-white/10 border-dashed bg-transparent p-6 transition-all hover:border-primary/50 hover:bg-primary/5"
						>
							<div className="flex size-12 items-center justify-center rounded-full bg-white/5 transition-transform group-hover:scale-110 group-hover:bg-primary/20">
								<svg
									aria-hidden="true"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									className="text-muted-foreground group-hover:text-primary"
								>
									<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
									<line x1="12" y1="10" x2="12" y2="16" />
									<line x1="9" y1="13" x2="15" y2="13" />
								</svg>
							</div>
							<span className="font-medium text-muted-foreground group-hover:text-primary">
								Scan Folder
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
	onScan,
}: {
	volume: Volume;
	onScan: () => void;
}) {
	const usedPercent =
		volume.total_bytes > 0 ? (volume.used_bytes / volume.total_bytes) * 100 : 0;

	const displayName = volume.name || volume.mount_point;

	// Color coding based on usage
	let usageColor = "var(--primary)";
	if (usedPercent > 90) usageColor = "var(--destructive)";
	else if (usedPercent > 70) usageColor = "var(--chart-4)";

	return (
		<button
			type="button"
			onClick={onScan}
			className="group relative flex flex-col justify-between gap-6 rounded-2xl border border-white/10 bg-card/40 p-6 text-left shadow-lg backdrop-blur-md transition-all hover:-translate-y-1 hover:border-primary/30 hover:bg-card/60 hover:shadow-primary/5"
		>
			<div className="flex w-full items-start justify-between">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<svg
							aria-hidden="true"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="text-primary"
						>
							<rect x="2" y="6" width="20" height="12" rx="2" />
							<line x1="6" y1="12" x2="6" y2="12" />
							<line x1="10" y1="12" x2="10" y2="12" />
						</svg>
						<h3
							className="max-w-[140px] truncate font-semibold text-lg tracking-tight"
							title={displayName}
						>
							{displayName}
						</h3>
					</div>
					<p className="font-mono text-muted-foreground text-xs">
						{volume.mount_point}
					</p>
				</div>

				<CircularProgress
					value={usedPercent}
					size={48}
					strokeWidth={4}
					color={usageColor}
					className="text-white/10"
				/>
			</div>

			<div className="w-full space-y-2">
				<div className="flex justify-between font-medium text-xs">
					<span className="text-muted-foreground">Used</span>
					<span className="text-foreground">
						{formatBytes(volume.used_bytes)}
					</span>
				</div>
				<div className="h-px w-full bg-white/10" />
				<div className="flex justify-between font-medium text-xs">
					<span className="text-muted-foreground">Total</span>
					<span className="text-foreground">
						{formatBytes(volume.total_bytes)}
					</span>
				</div>
			</div>

			{/* Hover glow effect */}
			<div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10 ring-inset transition-all group-hover:ring-primary/20" />
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
