import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";

const RootLayout = () => (
	<>
		<div className="dark grid h-screen grid-rows-[2.75rem_minmax(0,1fr)] text-foreground antialiased">
			<div data-tauri-drag-region className="select-none" />
			<div className="min-h-0 w-full overflow-hidden">
				<Outlet />
			</div>
		</div>
		<Toaster theme="dark" position="bottom-right" />
	</>
);

export const Route = createRootRoute({ component: RootLayout });
