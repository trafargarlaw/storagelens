import { AppLogo } from "@/components/app-logo";
import { formatBytes, formatNumber } from "@/lib/format";
import type { ScanProgress } from "@/types";

interface ScanProgressDisplayProps {
	progress: ScanProgress | null;
}

export function ScanProgressDisplay({ progress }: ScanProgressDisplayProps) {
	const percent = progress ? Math.round(progress.ratio * 100) : 0;

	return (
		<div className="page-enter flex min-h-full flex-col items-center justify-center px-6">
			<div className="w-full max-w-xs space-y-8">
				{/* Animated icon */}
				<div className="flex justify-center">
					<div className="relative flex size-20 items-center justify-center">
						{/* Outer pulsing ring */}
						<div className="pulse-soft absolute inset-0 rounded-full border border-primary/30" />
						{/* Spinning ring */}
						<div className="scan-ring-spin absolute inset-1 rounded-full border-2 border-transparent border-t-primary" />
						<AppLogo aria-hidden="true" className="size-10" />
					</div>
				</div>

				<div className="space-y-5 text-center">
					<div className="space-y-1">
						<h2 className="font-medium text-base tracking-tight">Scanning</h2>
						<p className="text-muted-foreground text-xs">
							Analyzing file system
						</p>
					</div>

					{/* Progress bar */}
					<div className="space-y-2">
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
							<div
								className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
								style={{ width: `${percent}%` }}
							/>
						</div>
						<p className="font-mono text-primary text-sm tabular-nums">
							{percent}%
						</p>
					</div>

					{/* Stats */}
					{progress && (
						<div className="flex justify-center gap-8 text-xs">
							<div className="space-y-0.5 text-center">
								<p className="font-medium font-mono text-foreground tabular-nums">
									{formatNumber(Number(progress.scanned_directories))}
								</p>
								<p className="text-muted-foreground">dirs</p>
							</div>
							<div className="space-y-0.5 text-center">
								<p className="font-medium font-mono text-foreground tabular-nums">
									{formatBytes(progress.scanned_bytes)}
								</p>
								<p className="text-muted-foreground">scanned</p>
							</div>
							{progress.target_bytes && (
								<div className="space-y-0.5 text-center">
									<p className="font-medium font-mono text-foreground tabular-nums">
										{formatBytes(progress.target_bytes)}
									</p>
									<p className="text-muted-foreground">total</p>
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
