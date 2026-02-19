import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { UpdateButton } from "@/components/update-button/update-button";
import { useAutoUpdate } from "@/hooks/use-auto-update";

const RootLayout = () => {
	const updater = useAutoUpdate();

	return (
		<>
			<div className="dark grid h-screen grid-rows-[2.75rem_minmax(0,1fr)] text-foreground antialiased">
				<div className="flex items-center justify-between border-border/40 border-b bg-card/20 px-3">
					<div data-tauri-drag-region className="h-full flex-1 select-none" />
					<UpdateButton
						status={updater.status}
						availableVersion={updater.availableVersion}
						progress={updater.progress}
						isChecking={updater.isChecking}
						isUnsupported={updater.isUnsupported}
						downloadUpdate={() => void updater.downloadUpdate()}
						installUpdate={() => void updater.installUpdate()}
					/>
				</div>
				<div className="min-h-0 w-full overflow-hidden">
					<Outlet />
				</div>
			</div>
			<Toaster theme="dark" position="bottom-right" />
		</>
	);
};

export const Route = createRootRoute({ component: RootLayout });
