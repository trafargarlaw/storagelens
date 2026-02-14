use serde::Serialize;

use crate::scanner::{NodeKind, ScanNode, ScanTree};

#[derive(Debug, Clone, Serialize)]
pub struct VolumeInfo {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_bytes: u64,
    pub fs_type: String,
    pub is_removable: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanNodeDto {
    pub id: usize,
    pub parent_id: Option<usize>,
    pub name: String,
    pub kind: String,
    pub size_bytes: u64,
    pub direct_size_bytes: u64,
    pub child_count: usize,
    pub errors: ErrorCountsDto,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorCountsDto {
    pub denied: u64,
    pub missing: u64,
    pub symlinks: u64,
    pub other: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanProgressDto {
    pub ratio: f64,
    pub scanned_directories: u64,
    pub pending_directories: usize,
    pub scanned_bytes: u64,
    pub target_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanResultDto {
    pub scan_id: String,
    pub root_path: String,
    pub root_id: usize,
    pub total_size: u64,
    pub file_count: usize,
    pub dir_count: usize,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanHistoryItemDto {
    pub scan_id: String,
    pub root_path: String,
    pub root_id: usize,
    pub total_size: u64,
    pub file_count: usize,
    pub dir_count: usize,
    pub elapsed_ms: u64,
    pub created_at_ms: u64,
}

impl ScanNodeDto {
    pub fn from_scan_node(node: &ScanNode) -> Self {
        Self {
            id: node.id,
            parent_id: node.parent_id,
            name: node.name.to_string_lossy().into_owned(),
            kind: node.kind.as_str().to_owned(),
            size_bytes: node.size_bytes,
            direct_size_bytes: node.direct_size_bytes,
            child_count: node.children.len(),
            errors: ErrorCountsDto {
                denied: node.errors.denied,
                missing: node.errors.missing,
                symlinks: node.errors.symlinks,
                other: node.errors.other,
            },
        }
    }
}

impl ScanResultDto {
    pub fn from_scan_tree(scan_id: impl Into<String>, tree: &ScanTree) -> Self {
        Self {
            scan_id: scan_id.into(),
            root_path: tree.root_path.to_string_lossy().into_owned(),
            root_id: tree.root_id,
            total_size: tree.root().size_bytes,
            file_count: tree.count_by_kind(NodeKind::File),
            dir_count: tree.count_by_kind(NodeKind::Directory),
            elapsed_ms: tree.elapsed.as_millis() as u64,
        }
    }
}

impl ScanHistoryItemDto {
    pub fn from_scan_tree(scan_id: impl Into<String>, created_at_ms: u64, tree: &ScanTree) -> Self {
        Self {
            scan_id: scan_id.into(),
            root_path: tree.root_path.to_string_lossy().into_owned(),
            root_id: tree.root_id,
            total_size: tree.root().size_bytes,
            file_count: tree.count_by_kind(NodeKind::File),
            dir_count: tree.count_by_kind(NodeKind::Directory),
            elapsed_ms: tree.elapsed.as_millis() as u64,
            created_at_ms,
        }
    }
}
