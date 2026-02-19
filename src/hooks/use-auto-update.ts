import { useCallback, useEffect, useRef, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type UpdateStatus =
	| "idle"
	| "available"
	| "downloading"
	| "downloaded"
	| "not-available";

interface UseAutoUpdateResult {
	status: UpdateStatus;
	availableVersion: string | null;
	progress: number;
	isChecking: boolean;
	isUnsupported: boolean;
	checkForUpdates: () => Promise<void>;
	downloadUpdate: () => Promise<void>;
	installUpdate: () => Promise<void>;
}

const UNSUPPORTED_ERROR_PATTERNS = [
	/not configured/i,
	/not available/i,
	/not supported/i,
	/not implemented/i,
	/plugin.+updater/i,
];

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return String(error);
}

function isUnsupportedError(error: unknown): boolean {
	const message = getErrorMessage(error);
	return UNSUPPORTED_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function useAutoUpdate(): UseAutoUpdateResult {
	const updateRef = useRef<Update | null>(null);
	const isCheckingRef = useRef(false);
	const isUnsupportedRef = useRef(false);
	const [status, setStatus] = useState<UpdateStatus>("idle");
	const [availableVersion, setAvailableVersion] = useState<string | null>(null);
	const [progress, setProgress] = useState(0);
	const [isChecking, setIsChecking] = useState(false);
	const [isUnsupported, setIsUnsupported] = useState(false);

	const markUnsupported = useCallback(() => {
		isUnsupportedRef.current = true;
		setIsUnsupported(true);
	}, []);

	const checkForUpdates = useCallback(async () => {
		if (isCheckingRef.current || isUnsupportedRef.current) return;
		isCheckingRef.current = true;
		setIsChecking(true);
		try {
			const update = await check();
			updateRef.current = update;

			if (update) {
				setStatus("available");
				setAvailableVersion(update.version);
				setProgress(0);
			} else {
				setStatus("not-available");
				setAvailableVersion(null);
				setProgress(0);
			}
		} catch (error) {
			if (isUnsupportedError(error)) {
				markUnsupported();
			}
			setStatus("idle");
		} finally {
			isCheckingRef.current = false;
			setIsChecking(false);
		}
	}, [markUnsupported]);

	const downloadUpdate = useCallback(async () => {
		if (status === "downloading" || status === "downloaded") return;

		let update = updateRef.current;
		if (!update) {
			await checkForUpdates();
			update = updateRef.current;
		}
		if (!update) return;

		setStatus("downloading");
		setProgress(0);

		let totalBytes = 0;
		let downloadedBytes = 0;

		try {
			await update.download((event) => {
				if (event.event === "Started") {
					totalBytes = event.data.contentLength ?? 0;
					downloadedBytes = 0;
					setProgress(0);
					return;
				}

				if (event.event === "Progress") {
					downloadedBytes += event.data.chunkLength;
					if (totalBytes > 0) {
						const nextProgress = Math.min(
							100,
							Math.round((downloadedBytes / totalBytes) * 100),
						);
						setProgress(nextProgress);
					}
					return;
				}

				setProgress(100);
			});

			setStatus("downloaded");
		} catch (error) {
			if (isUnsupportedError(error)) {
				markUnsupported();
				setStatus("idle");
				return;
			}
			setStatus("available");
		}
	}, [checkForUpdates, markUnsupported, status]);

	const installUpdate = useCallback(async () => {
		const update = updateRef.current;
		if (!update) return;

		try {
			await update.install();
			await relaunch();
		} catch (error) {
			if (isUnsupportedError(error)) {
				markUnsupported();
				setStatus("idle");
				return;
			}
			setStatus("downloaded");
		}
	}, [markUnsupported]);

	useEffect(() => {
		const hasTauriRuntime =
			typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

		if (!hasTauriRuntime) {
			markUnsupported();
			return;
		}

		void checkForUpdates();

		return () => {
			const update = updateRef.current;
			updateRef.current = null;
			if (update) {
				void update.close();
			}
		};
	}, [checkForUpdates, markUnsupported]);

	return {
		status,
		availableVersion,
		progress,
		isChecking,
		isUnsupported,
		checkForUpdates,
		downloadUpdate,
		installUpdate,
	};
}
