import { useEffect, useRef, useState } from "react";
import { CircularProgress } from "@/components/circular-progress";
import { Button } from "@/components/ui/button";
import type { UpdateStatus } from "@/hooks/use-auto-update";
import { cn } from "@/lib/utils";

interface UpdateButtonProps {
  className?: string;
  status: UpdateStatus;
  availableVersion: string | null;
  progress: number;
  isChecking: boolean;
  isUnsupported: boolean;
  downloadUpdate: () => void;
  installUpdate: () => void;
}

export function UpdateButton({
	className,
	status,
	availableVersion,
	progress,
	isChecking,
	isUnsupported,
	downloadUpdate,
	installUpdate,
}: UpdateButtonProps) {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!isOpen) return;

		const closeOnOutside = (event: PointerEvent) => {
			if (!containerRef.current?.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};

		document.addEventListener("pointerdown", closeOnOutside);
		return () => {
			document.removeEventListener("pointerdown", closeOnOutside);
		};
	}, [isOpen]);

	if (
		status === "idle" ||
		isUnsupported ||
		isChecking ||
		status === "not-available"
	) {
		return null;
	}

	const downloading = status === "downloading";
	const available = status === "available";
	const downloaded = status === "downloaded";
	const hasNotification = available || downloaded;

	return (
		<div ref={containerRef} className={cn("relative", className)}>
			<button
				type="button"
				aria-label="Open update menu"
				data-testid="update-trigger"
				onClick={() => setIsOpen((prev) => !prev)}
				className="relative flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted"
			>
				{downloading ? (
					<div className="relative flex size-7 items-center justify-center">
						<CircularProgress value={progress} size={28} strokeWidth={2.4} />
						<span className="absolute font-mono text-[8px] text-foreground">
							{Math.round(progress)}%
						</span>
					</div>
				) : (
					<GiftIcon className="size-4 text-accent-foreground" />
				)}

				{hasNotification && (
					<span
						aria-hidden="true"
						data-testid="update-notification-dot"
						className={cn(
							"absolute top-1 right-1 size-2 animate-pulse rounded-full",
							downloaded ? "bg-green-500" : "bg-primary",
						)}
					/>
				)}
			</button>

			{isOpen && (
				<div className="absolute top-10 right-0 z-50 w-64 rounded-xl border border-border/70 bg-popover p-4 shadow-xl">
					{available && (
						<div className="flex items-start justify-between gap-3">
							<div className="space-y-1">
								<p className="font-medium text-sm">Update Available</p>
								<p className="text-muted-foreground text-xs">
									Version {availableVersion}
								</p>
							</div>
							<Button
								size="sm"
								aria-label="Download update"
								onClick={() => {
									void downloadUpdate();
									setIsOpen(false);
								}}
							>
								<DownloadIcon className="size-4" />
							</Button>
						</div>
					)}

					{downloading && (
						<div className="flex flex-col items-center gap-3 py-2">
							<div className="relative flex size-16 items-center justify-center">
								<CircularProgress value={progress} size={64} strokeWidth={4} />
								<span className="absolute font-medium text-xs">
									{Math.round(progress)}%
								</span>
							</div>
							<p className="text-muted-foreground text-sm">
								Downloading update...
							</p>
						</div>
					)}

					{downloaded && (
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<GiftIcon className="size-5 text-green-500" />
								<div>
									<p className="font-medium text-sm">Ready to Install</p>
									<p className="text-muted-foreground text-xs">
										Version {availableVersion} is ready
									</p>
								</div>
							</div>
							<Button
								size="sm"
								className="w-full bg-green-500 text-white hover:bg-green-600"
								onClick={() => {
									void installUpdate();
									setIsOpen(false);
								}}
							>
								Restart &amp; Install
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function GiftIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" />
			<path d="M2 7h20v5H2z" />
			<path d="M12 21V7" />
			<path d="M12 7H7.5a2.5 2.5 0 1 1 0-5c2.4 0 4.5 2.3 4.5 5Z" />
			<path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C14.1 2 12 4.3 12 7Z" />
		</svg>
	);
}

function DownloadIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M12 3v12" />
			<path d="m7 10 5 5 5-5" />
			<path d="M4 21h16" />
		</svg>
	);
}
