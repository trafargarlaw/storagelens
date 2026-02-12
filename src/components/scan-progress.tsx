import { AppLogo } from "@/components/app-logo";
import { Progress } from "@/components/ui/progress";
import { formatBytes, formatNumber } from "@/lib/format";
import type { ScanProgress } from "@/types";

interface ScanProgressDisplayProps {
	progress: ScanProgress | null;
}

export function ScanProgressDisplay({ progress }: ScanProgressDisplayProps) {
	const percent = progress ? Math.round(progress.ratio * 100) : 0;

	return (
		<div className="flex min-h-full flex-col items-center justify-center px-6">
			<div className="w-full max-w-sm space-y-8">
				{/* Animated icon */}
				<div className="flex justify-center">
					<div className="relative flex size-16 items-center justify-center">
						<div className="absolute inset-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
						<AppLogo aria-hidden="true" className="size-10 rounded-2xl" />
					</div>
				</div>

				<div className="space-y-4 text-center">
					<div className="space-y-1">
						<h2 className="font-medium text-base">Scanning...</h2>
						<p className="text-muted-foreground text-xs">
							Analyzing file system structure
						</p>
					</div>

					{/* Progress bar */}
					<div className="space-y-2">
						<Progress value={percent} className="h-2" />
						<p className="font-medium text-primary text-sm tabular-nums">
							{percent}%
						</p>
					</div>

					{/* Stats */}
					{progress && (
						<div className="flex justify-center gap-6 text-muted-foreground text-xs">
							<div className="space-y-0.5">
								<p className="font-medium text-foreground tabular-nums">
									{formatNumber(Number(progress.scanned_directories))}
								</p>
								<p>directories</p>
							</div>
							<div className="space-y-0.5">
								<p className="font-medium text-foreground tabular-nums">
									{formatBytes(progress.scanned_bytes)}
								</p>
								<p>scanned</p>
							</div>
							{progress.target_bytes && (
								<div className="space-y-0.5">
									<p className="font-medium text-foreground tabular-nums">
										{formatBytes(progress.target_bytes)}
									</p>
									<p>total</p>
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
