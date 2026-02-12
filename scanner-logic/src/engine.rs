use std::collections::{HashSet, VecDeque};
use std::ffi::{OsStr, OsString};
use std::fs;
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Condvar, Mutex, mpsc};
use std::thread;
use std::time::{Duration, Instant};

use crate::model::{ErrorCounts, NodeKind, ScanConfig, ScanNode, ScanProgress, ScanTree};

#[derive(Debug)]
struct ScanTask {
    node_id: usize,
    path: PathBuf,
}

#[derive(Debug, Default)]
struct TaskQueueState {
    tasks: VecDeque<ScanTask>,
    closed: bool,
}

#[derive(Debug, Default)]
struct TaskQueue {
    state: Mutex<TaskQueueState>,
    has_work: Condvar,
}

impl TaskQueue {
    fn lock_state(&self) -> std::sync::MutexGuard<'_, TaskQueueState> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn push(&self, task: ScanTask) -> bool {
        let mut state = self.lock_state();
        if state.closed {
            return false;
        }
        state.tasks.push_back(task);
        self.has_work.notify_one();
        true
    }

    fn pop(&self) -> Option<ScanTask> {
        let mut state = self.lock_state();
        loop {
            if let Some(task) = state.tasks.pop_front() {
                return Some(task);
            }
            if state.closed {
                return None;
            }
            state = self
                .has_work
                .wait(state)
                .unwrap_or_else(|poisoned| poisoned.into_inner());
        }
    }

    fn close(&self) {
        let mut state = self.lock_state();
        state.closed = true;
        self.has_work.notify_all();
    }

    fn len(&self) -> usize {
        let state = self.lock_state();
        state.tasks.len()
    }
}

#[derive(Debug)]
struct FileEntry {
    name: OsString,
    size_bytes: u64,
    progress_size_bytes: u64,
    object_id: Option<FsObjectId>,
}

#[derive(Debug)]
struct DirectoryEntry {
    name: OsString,
    path: PathBuf,
    object_id: Option<FsObjectId>,
}

#[derive(Debug, Default)]
struct DirectoryScan {
    files: Vec<FileEntry>,
    child_directories: Vec<DirectoryEntry>,
    errors: ErrorCounts,
}

#[derive(Debug)]
struct WorkerResult {
    node_id: usize,
    output: DirectoryScan,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct FsObjectId {
    device: u64,
    inode: u64,
}

pub fn validate_root(root: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(root)?;
    if metadata.file_type().is_symlink() {
        return Err(invalid_input(
            "root path must be a directory, not a symlink",
        ));
    }
    if !metadata.is_dir() {
        return Err(invalid_input("root path must be a directory"));
    }
    Ok(())
}

pub fn scan_tree(config: &ScanConfig) -> io::Result<ScanTree> {
    let started = Instant::now();
    let queue = Arc::new(TaskQueue::default());
    let (result_tx, result_rx) = mpsc::channel::<WorkerResult>();

    let root_metadata = fs::symlink_metadata(&config.root)?;
    let use_filesystem_target = is_mount_point_path(&config.root);
    let mut seen_directories: HashSet<FsObjectId> = HashSet::new();
    let mut target_devices: HashSet<u64> = HashSet::new();
    let mut target_used_bytes = if use_filesystem_target {
        filesystem_used_bytes(&config.root)
    } else {
        None
    };
    #[cfg(target_os = "macos")]
    {
        if use_filesystem_target && config.root == Path::new("/") {
            if let Some(data_used_bytes) = filesystem_used_bytes(Path::new("/System/Volumes/Data"))
            {
                target_used_bytes = Some(
                    target_used_bytes
                        .unwrap_or(0)
                        .saturating_add(data_used_bytes),
                );
            }
        }
    }
    if let Some(root_object_id) = filesystem_object_id(&root_metadata) {
        seen_directories.insert(root_object_id);
        if use_filesystem_target {
            target_devices.insert(root_object_id.device);
        }
    }
    let mut seen_files: HashSet<FsObjectId> = HashSet::new();
    let mut scanned_progress_bytes = 0u64;

    let mut worker_handles = Vec::with_capacity(config.workers);
    for _ in 0..config.workers {
        let queue = Arc::clone(&queue);
        let tx = result_tx.clone();
        worker_handles.push(thread::spawn(move || worker_loop(queue, tx)));
    }
    drop(result_tx);

    let mut nodes = Vec::new();
    nodes.push(ScanNode::new_directory(0, None, root_name(&config.root)));

    if !queue.push(ScanTask {
        node_id: 0,
        path: config.root.clone(),
    }) {
        return Err(io::Error::other("failed to enqueue root scan task"));
    }

    let mut pending_directories = 1usize;
    let mut scanned_directories = 0u64;
    let mut last_progress = Instant::now();
    let mut failure: Option<io::Error> = None;

    while pending_directories > 0 {
        match result_rx.recv_timeout(Duration::from_millis(250)) {
            Ok(worker_result) => {
                pending_directories -= 1;
                scanned_directories += 1;

                let WorkerResult { node_id, output } = worker_result;

                let mut new_child_ids =
                    Vec::with_capacity(output.files.len() + output.child_directories.len());
                let mut direct_size = 0u64;

                for file in output.files {
                    if let Some(object_id) = file.object_id {
                        if !seen_files.insert(object_id) {
                            continue;
                        }
                    }

                    scanned_progress_bytes =
                        scanned_progress_bytes.saturating_add(file.progress_size_bytes);
                    direct_size = direct_size.saturating_add(file.size_bytes);
                    let child_id = nodes.len();
                    nodes.push(ScanNode::new_file(
                        child_id,
                        Some(node_id),
                        file.name,
                        file.size_bytes,
                    ));
                    new_child_ids.push(child_id);
                }

                for directory in output.child_directories {
                    if let Some(object_id) = directory.object_id {
                        if !seen_directories.insert(object_id) {
                            continue;
                        }

                        if use_filesystem_target && target_devices.insert(object_id.device) {
                            if let Some(used_on_device) = filesystem_used_bytes(&directory.path) {
                                target_used_bytes = Some(
                                    target_used_bytes
                                        .unwrap_or(0)
                                        .saturating_add(used_on_device),
                                );
                            }
                        }
                    }

                    let child_id = nodes.len();
                    nodes.push(ScanNode::new_directory(
                        child_id,
                        Some(node_id),
                        directory.name,
                    ));
                    new_child_ids.push(child_id);
                    if queue.push(ScanTask {
                        node_id: child_id,
                        path: directory.path,
                    }) {
                        pending_directories += 1;
                    } else {
                        failure = Some(io::Error::other(
                            "task queue closed while scheduling child directories",
                        ));
                        break;
                    }
                }

                if let Some(directory_node) = nodes.get_mut(node_id) {
                    directory_node.direct_size_bytes = direct_size;
                    directory_node.errors = output.errors;
                    directory_node.children.extend(new_child_ids);
                } else if failure.is_none() {
                    failure = Some(io::Error::other(
                        "worker referenced an unknown directory node",
                    ));
                }

                if failure.is_some() {
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                failure = Some(io::Error::new(
                    ErrorKind::BrokenPipe,
                    "worker result channel disconnected before scan finished",
                ));
                break;
            }
        }

        if last_progress.elapsed() >= Duration::from_secs(1) {
            if config.show_progress {
                emit_progress_line(
                    scanned_directories,
                    pending_directories,
                    queue.len(),
                    scanned_progress_bytes,
                    target_used_bytes,
                    false,
                    started.elapsed(),
                );
            }
            if let Some(ref sender) = config.progress_sender {
                let _ = sender.send(ScanProgress {
                    ratio: progress_ratio(
                        scanned_directories,
                        pending_directories,
                        scanned_progress_bytes,
                        target_used_bytes,
                        false,
                    ),
                    scanned_directories,
                    pending_directories,
                    scanned_bytes: scanned_progress_bytes,
                    target_bytes: target_used_bytes,
                });
            }
            last_progress = Instant::now();
        }
    }

    queue.close();

    for handle in worker_handles {
        if handle.join().is_err() && failure.is_none() {
            failure = Some(io::Error::other("a scanner worker thread panicked"));
        }
    }

    if let Some(error) = failure {
        return Err(error);
    }

    if pending_directories != 0 {
        return Err(io::Error::other(
            "scan terminated before all directories were processed",
        ));
    }

    if config.show_progress {
        emit_progress_line(
            scanned_directories,
            pending_directories,
            queue.len(),
            scanned_progress_bytes,
            target_used_bytes,
            true,
            started.elapsed(),
        );
    }
    if let Some(ref sender) = config.progress_sender {
        let _ = sender.send(ScanProgress {
            ratio: 1.0,
            scanned_directories,
            pending_directories,
            scanned_bytes: scanned_progress_bytes,
            target_bytes: target_used_bytes,
        });
    }

    compute_recursive_sizes(&mut nodes, 0);
    sort_children_for_ui(&mut nodes);

    Ok(ScanTree {
        root_path: config.root.clone(),
        root_id: 0,
        nodes,
        scanned_directories,
        elapsed: started.elapsed(),
    })
}

fn invalid_input(message: &str) -> io::Error {
    io::Error::new(ErrorKind::InvalidInput, message.to_owned())
}

fn filesystem_object_id(metadata: &fs::Metadata) -> Option<FsObjectId> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;

        Some(FsObjectId {
            device: metadata.dev(),
            inode: metadata.ino(),
        })
    }

    #[cfg(not(unix))]
    {
        let _ = metadata;
        None
    }
}

fn filesystem_allocated_bytes(metadata: &fs::Metadata) -> Option<u64> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;

        let bytes = (metadata.blocks() as u128).saturating_mul(512);
        Some(bytes.min(u64::MAX as u128) as u64)
    }

    #[cfg(not(unix))]
    {
        let _ = metadata;
        None
    }
}

fn filesystem_used_bytes(path: &Path) -> Option<u64> {
    #[cfg(unix)]
    {
        let output = Command::new("df").arg("-k").arg(path).output().ok()?;
        if !output.status.success() {
            return None;
        }

        let stdout = String::from_utf8(output.stdout).ok()?;
        let used_kib = parse_df_used_kib(&stdout)?;
        Some(used_kib.saturating_mul(1024))
    }

    #[cfg(not(unix))]
    {
        let _ = path;
        None
    }
}

fn parse_df_used_kib(df_output: &str) -> Option<u64> {
    let data_line = df_output.lines().rev().find(|line| {
        let line = line.trim();
        !line.is_empty() && !line.starts_with("Filesystem")
    })?;

    let columns: Vec<&str> = data_line.split_whitespace().collect();
    if columns.len() < 3 {
        return None;
    }

    columns[2].parse::<u64>().ok()
}

fn is_mount_point_path(path: &Path) -> bool {
    #[cfg(unix)]
    {
        let root = match fs::canonicalize(path) {
            Ok(path) => path,
            Err(_) => return false,
        };

        let mut current = root.clone();
        loop {
            let current_md = match fs::symlink_metadata(&current) {
                Ok(md) => md,
                Err(_) => return false,
            };
            let Some(current_id) = filesystem_object_id(&current_md) else {
                return false;
            };

            let Some(parent) = current.parent() else {
                return current == root;
            };
            let parent_md = match fs::symlink_metadata(parent) {
                Ok(md) => md,
                Err(_) => return false,
            };
            let Some(parent_id) = filesystem_object_id(&parent_md) else {
                return false;
            };

            if parent_id.device != current_id.device {
                return current == root;
            }
            current = parent.to_path_buf();
        }
    }

    #[cfg(not(unix))]
    {
        let _ = path;
        true
    }
}

fn progress_ratio(
    scanned_directories: u64,
    pending_directories: usize,
    scanned_bytes: u64,
    target_used_bytes: Option<u64>,
    is_complete: bool,
) -> f64 {
    let mut ratio = if let Some(target) = target_used_bytes {
        if target == 0 {
            1.0
        } else {
            (scanned_bytes as f64 / target as f64).clamp(0.0, 1.0)
        }
    } else {
        let total_estimate = scanned_directories.saturating_add(pending_directories as u64);
        if total_estimate == 0 {
            1.0
        } else {
            (scanned_directories as f64 / total_estimate as f64).clamp(0.0, 1.0)
        }
    };

    if !is_complete {
        ratio = ratio.min(0.99);
    }
    ratio
}

fn emit_progress_line(
    scanned_directories: u64,
    pending_directories: usize,
    queued_directories: usize,
    scanned_bytes: u64,
    target_used_bytes: Option<u64>,
    is_complete: bool,
    elapsed: Duration,
) {
    let ratio = progress_ratio(
        scanned_directories,
        pending_directories,
        scanned_bytes,
        target_used_bytes,
        is_complete,
    );

    match target_used_bytes {
        Some(target) => {
            eprintln!(
                "progress: {:>5.1}% | scanned: {} / {} | dirs: {} | pending: {} | queued: {} | elapsed: {:.1?}",
                ratio * 100.0,
                human_bytes(scanned_bytes),
                human_bytes(target),
                scanned_directories,
                pending_directories,
                queued_directories,
                elapsed
            );
        }
        None => {
            eprintln!(
                "progress: {:>5.1}% | scanned: {} | dirs: {} | pending: {} | queued: {} | elapsed: {:.1?}",
                ratio * 100.0,
                human_bytes(scanned_bytes),
                scanned_directories,
                pending_directories,
                queued_directories,
                elapsed
            );
        }
    }
}

fn human_bytes(bytes: u64) -> String {
    const UNITS: [&str; 6] = ["B", "KB", "MB", "GB", "TB", "PB"];
    let mut value = bytes as f64;
    let mut unit_idx = 0usize;
    while value >= 1024.0 && unit_idx + 1 < UNITS.len() {
        value /= 1024.0;
        unit_idx += 1;
    }

    if unit_idx == 0 {
        format!("{bytes} {}", UNITS[unit_idx])
    } else {
        format!("{value:.2} {}", UNITS[unit_idx])
    }
}

fn root_name(root: &Path) -> OsString {
    root.file_name()
        .map(OsStr::to_os_string)
        .unwrap_or_else(|| root.as_os_str().to_os_string())
}

fn worker_loop(queue: Arc<TaskQueue>, result_tx: mpsc::Sender<WorkerResult>) {
    while let Some(task) = queue.pop() {
        let output = scan_directory(&task.path);
        if result_tx
            .send(WorkerResult {
                node_id: task.node_id,
                output,
            })
            .is_err()
        {
            break;
        }
    }
}

fn scan_directory(path: &Path) -> DirectoryScan {
    let mut output = DirectoryScan::default();

    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error) => {
            output.errors.record_io_error(&error);
            return output;
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                output.errors.record_io_error(&error);
                continue;
            }
        };

        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) => {
                output.errors.record_io_error(&error);
                continue;
            }
        };

        let file_type = metadata.file_type();
        if file_type.is_symlink() {
            output.errors.symlinks += 1;
            continue;
        }

        if file_type.is_dir() {
            output.child_directories.push(DirectoryEntry {
                name: entry.file_name(),
                path,
                object_id: filesystem_object_id(&metadata),
            });
            continue;
        }

        if file_type.is_file() {
            output.files.push(FileEntry {
                name: entry.file_name(),
                size_bytes: metadata.len(),
                progress_size_bytes: filesystem_allocated_bytes(&metadata)
                    .unwrap_or(metadata.len()),
                object_id: filesystem_object_id(&metadata),
            });
            continue;
        }

        // Sockets, device files, etc. are intentionally ignored from size accounting.
        output.errors.other += 1;
    }

    output
}

fn compute_recursive_sizes(nodes: &mut [ScanNode], root_id: usize) {
    let mut traversal = Vec::with_capacity(nodes.len());
    let mut stack = vec![root_id];
    while let Some(node_id) = stack.pop() {
        traversal.push(node_id);
        if nodes[node_id].kind == NodeKind::Directory {
            for &child_id in &nodes[node_id].children {
                stack.push(child_id);
            }
        }
    }

    for node_id in traversal.into_iter().rev() {
        if nodes[node_id].kind == NodeKind::File {
            continue;
        }

        let mut total = nodes[node_id].direct_size_bytes;
        for &child_id in &nodes[node_id].children {
            if nodes[child_id].kind == NodeKind::Directory {
                total = total.saturating_add(nodes[child_id].size_bytes);
            }
        }
        nodes[node_id].size_bytes = total;
    }
}

fn sort_children_for_ui(nodes: &mut [ScanNode]) {
    let sizes: Vec<u64> = nodes.iter().map(|node| node.size_bytes).collect();
    let kinds: Vec<NodeKind> = nodes.iter().map(|node| node.kind).collect();
    let names: Vec<String> = nodes
        .iter()
        .map(|node| node.name.to_string_lossy().into_owned())
        .collect();

    for node in nodes
        .iter_mut()
        .filter(|node| node.kind == NodeKind::Directory)
    {
        node.children.sort_by(|a, b| {
            kind_rank(kinds[*a])
                .cmp(&kind_rank(kinds[*b]))
                .then_with(|| sizes[*b].cmp(&sizes[*a]))
                .then_with(|| names[*a].cmp(&names[*b]))
        });
    }
}

fn kind_rank(kind: NodeKind) -> u8 {
    match kind {
        NodeKind::Directory => 0,
        NodeKind::File => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn new_temp_dir(label: &str) -> PathBuf {
        let mut path = env::temp_dir();
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after UNIX_EPOCH")
            .as_nanos();
        path.push(format!(
            "scanner-test-{}-{}-{}",
            label,
            std::process::id(),
            stamp
        ));
        fs::create_dir_all(&path).expect("failed to create temp test directory");
        path
    }

    fn write_file_with_size(path: &Path, size: usize) {
        let data = vec![b'x'; size];
        fs::write(path, data).expect("failed to write test file");
    }

    fn find_child(tree: &ScanTree, parent_id: usize, name: &str, kind: NodeKind) -> Option<usize> {
        tree.nodes[parent_id]
            .children
            .iter()
            .copied()
            .find(|child_id| {
                let child = &tree.nodes[*child_id];
                child.kind == kind && child.name.to_string_lossy() == name
            })
    }

    #[test]
    fn computes_recursive_sizes_for_nested_directories() {
        let root = new_temp_dir("sizes");
        let result = (|| -> io::Result<()> {
            fs::create_dir_all(root.join("alpha"))?;
            fs::create_dir_all(root.join("beta").join("inner"))?;

            write_file_with_size(&root.join("top.bin"), 5);
            write_file_with_size(&root.join("alpha").join("a.bin"), 10);
            write_file_with_size(&root.join("beta").join("inner").join("b.bin"), 20);

            let tree = scan_tree(&ScanConfig {
                root: root.clone(),
                workers: 3,
                show_progress: false,
                progress_sender: None,
            })?;

            assert_eq!(tree.root().size_bytes, 35);

            let alpha_id = find_child(&tree, tree.root_id, "alpha", NodeKind::Directory)
                .expect("alpha directory should exist");
            assert_eq!(tree.nodes[alpha_id].size_bytes, 10);

            let beta_id = find_child(&tree, tree.root_id, "beta", NodeKind::Directory)
                .expect("beta directory should exist");
            assert_eq!(tree.nodes[beta_id].size_bytes, 20);

            Ok(())
        })();

        let _ = fs::remove_dir_all(&root);
        result.expect("recursive size test should succeed");
    }

    #[cfg(unix)]
    #[test]
    fn ignores_symlink_targets_in_size_accounting() {
        use std::os::unix::fs::symlink;

        let root = new_temp_dir("symlink");
        let result = (|| -> io::Result<()> {
            write_file_with_size(&root.join("real.bin"), 7);
            symlink(root.join("real.bin"), root.join("link.bin"))?;

            let tree = scan_tree(&ScanConfig {
                root: root.clone(),
                workers: 2,
                show_progress: false,
                progress_sender: None,
            })?;

            assert_eq!(tree.root().size_bytes, 7);
            assert_eq!(tree.root().errors.symlinks, 1);

            Ok(())
        })();

        let _ = fs::remove_dir_all(&root);
        result.expect("symlink accounting test should succeed");
    }

    #[cfg(unix)]
    #[test]
    fn counts_hard_linked_file_only_once() {
        use std::fs::hard_link;

        let root = new_temp_dir("hardlink");
        let result = (|| -> io::Result<()> {
            write_file_with_size(&root.join("shared.bin"), 11);
            hard_link(root.join("shared.bin"), root.join("shared-2.bin"))?;

            let tree = scan_tree(&ScanConfig {
                root: root.clone(),
                workers: 2,
                show_progress: false,
                progress_sender: None,
            })?;

            assert_eq!(tree.root().size_bytes, 11);
            assert_eq!(tree.count_by_kind(NodeKind::File), 1);

            Ok(())
        })();

        let _ = fs::remove_dir_all(&root);
        result.expect("hard link dedupe test should succeed");
    }

    #[test]
    fn parses_df_used_kib_output() {
        let sample = "\
Filesystem     1024-blocks      Used Available Capacity iused ifree %iused Mounted on
/dev/disk3s1     482797652 355774052  94081444    80%     0     0    0%   /System/Volumes/Data
";

        assert_eq!(parse_df_used_kib(sample), Some(355_774_052));
    }
}
