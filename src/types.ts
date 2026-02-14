export interface Volume {
	name: string;
	mount_point: string;
	total_bytes: number;
	available_bytes: number;
	used_bytes: number;
	fs_type: string;
	is_removable: boolean;
}

export interface ScanNode {
	id: number;
	parent_id: number | null;
	name: string;
	kind: "directory" | "file";
	size_bytes: number;
	direct_size_bytes: number;
	child_count: number;
	errors: ErrorCounts;
}

export interface ErrorCounts {
	denied: number;
	missing: number;
	symlinks: number;
	other: number;
}

export interface ScanProgress {
	ratio: number;
	scanned_directories: number;
	pending_directories: number;
	scanned_bytes: number;
	target_bytes: number | null;
}

export interface ScanResult {
	scan_id: string;
	root_path: string;
	root_id: number;
	total_size: number;
	file_count: number;
	dir_count: number;
	elapsed_ms: number;
}

export interface ScanHistoryItem {
	scan_id: string;
	root_path: string;
	root_id: number;
	total_size: number;
	file_count: number;
	dir_count: number;
	elapsed_ms: number;
	created_at_ms: number;
}
