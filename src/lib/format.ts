const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";

	let value = bytes;
	let unitIdx = 0;

	while (value >= 1024 && unitIdx + 1 < UNITS.length) {
		value /= 1024;
		unitIdx++;
	}

	if (unitIdx === 0) {
		return `${bytes} ${UNITS[unitIdx]}`;
	}

	return `${value.toFixed(1)} ${UNITS[unitIdx]}`;
}

export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.round(seconds % 60);
	return `${minutes}m ${remainingSeconds}s`;
}

export function formatNumber(n: number): string {
	return n.toLocaleString();
}
