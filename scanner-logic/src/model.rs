use std::ffi::OsString;
use std::io::{self, ErrorKind};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeKind {
    Directory,
    File,
}

impl NodeKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Directory => "directory",
            Self::File => "file",
        }
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct ErrorCounts {
    pub denied: u64,
    pub missing: u64,
    pub symlinks: u64,
    pub other: u64,
}

impl ErrorCounts {
    pub(crate) fn record_io_error(&mut self, error: &io::Error) {
        match error.kind() {
            ErrorKind::PermissionDenied => self.denied += 1,
            ErrorKind::NotFound => self.missing += 1,
            _ => self.other += 1,
        }
    }
}

#[derive(Debug)]
pub struct ScanNode {
    pub id: usize,
    pub parent_id: Option<usize>,
    pub name: OsString,
    pub kind: NodeKind,
    pub direct_size_bytes: u64,
    pub size_bytes: u64,
    pub children: Vec<usize>,
    pub errors: ErrorCounts,
}

impl ScanNode {
    pub(crate) fn new_directory(id: usize, parent_id: Option<usize>, name: OsString) -> Self {
        Self {
            id,
            parent_id,
            name,
            kind: NodeKind::Directory,
            direct_size_bytes: 0,
            size_bytes: 0,
            children: Vec::new(),
            errors: ErrorCounts::default(),
        }
    }

    pub(crate) fn new_file(
        id: usize,
        parent_id: Option<usize>,
        name: OsString,
        size_bytes: u64,
    ) -> Self {
        Self {
            id,
            parent_id,
            name,
            kind: NodeKind::File,
            direct_size_bytes: size_bytes,
            size_bytes,
            children: Vec::new(),
            errors: ErrorCounts::default(),
        }
    }
}

#[derive(Debug)]
pub struct ScanTree {
    pub root_path: PathBuf,
    pub root_id: usize,
    pub nodes: Vec<ScanNode>,
    pub scanned_directories: u64,
    pub elapsed: Duration,
}

impl ScanTree {
    pub fn root(&self) -> &ScanNode {
        &self.nodes[self.root_id]
    }

    pub fn count_by_kind(&self, kind: NodeKind) -> usize {
        self.nodes.iter().filter(|node| node.kind == kind).count()
    }

    pub fn absolute_path(&self, node_id: usize) -> PathBuf {
        if node_id == self.root_id {
            return self.root_path.clone();
        }

        let mut segments: Vec<OsString> = Vec::new();
        let mut cursor = node_id;
        loop {
            let node = &self.nodes[cursor];
            if cursor == self.root_id {
                break;
            }
            segments.push(node.name.clone());
            cursor = node
                .parent_id
                .expect("non-root nodes must always have a parent");
        }

        let mut path = self.root_path.clone();
        for segment in segments.into_iter().rev() {
            path.push(segment);
        }
        path
    }
}

#[derive(Debug, Clone)]
pub struct ScanProgress {
    pub ratio: f64,
    pub scanned_directories: u64,
    pub pending_directories: usize,
    pub scanned_bytes: u64,
    pub target_bytes: Option<u64>,
}

pub struct ScanConfig {
    pub root: PathBuf,
    pub workers: usize,
    pub show_progress: bool,
    pub progress_sender: Option<mpsc::Sender<ScanProgress>>,
}
