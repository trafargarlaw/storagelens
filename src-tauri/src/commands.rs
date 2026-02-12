use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::mpsc;
use std::thread;

use scanner::{ScanConfig, scan_tree, validate_root};
use sysinfo::Disks;
use tauri::{AppHandle, Emitter, Manager};

use crate::models::{ScanNodeDto, ScanProgressDto, ScanResultDto, VolumeInfo};
use crate::state::AppState;

#[tauri::command]
pub fn list_volumes() -> Vec<VolumeInfo> {
    let disks = Disks::new_with_refreshed_list();
    disks
        .iter()
        .map(|d| {
            let total = d.total_space();
            let available = d.available_space();
            VolumeInfo {
                name: d.name().to_string_lossy().into_owned(),
                mount_point: d.mount_point().to_string_lossy().into_owned(),
                total_bytes: total,
                available_bytes: available,
                used_bytes: total.saturating_sub(available),
                fs_type: d.file_system().to_string_lossy().into_owned(),
                is_removable: d.is_removable(),
            }
        })
        .collect()
}

#[tauri::command]
pub fn start_scan(app: AppHandle, path: String) -> Result<(), String> {
    let state = app.state::<AppState>();

    if state.scanning.load(Ordering::SeqCst) {
        return Err("A scan is already in progress".into());
    }

    let root = PathBuf::from(&path);
    validate_root(&root).map_err(|e| e.to_string())?;

    state.scanning.store(true, Ordering::SeqCst);
    // Clear previous scan
    {
        let mut tree = state.scan_tree.lock().unwrap();
        *tree = None;
    }

    let app_handle = app.clone();

    thread::spawn(move || {
        let (progress_tx, progress_rx) = mpsc::channel::<scanner::ScanProgress>();

        let scan_app = app_handle.clone();
        let progress_handle = thread::spawn(move || {
            while let Ok(progress) = progress_rx.recv() {
                let _ = scan_app.emit(
                    "scan-progress",
                    ScanProgressDto {
                        ratio: progress.ratio,
                        scanned_directories: progress.scanned_directories,
                        pending_directories: progress.pending_directories,
                        scanned_bytes: progress.scanned_bytes,
                        target_bytes: progress.target_bytes,
                    },
                );
            }
        });

        let workers = num_cpus().clamp(2, 32);
        let config = ScanConfig {
            root,
            workers,
            show_progress: false,
            progress_sender: Some(progress_tx),
        };

        let result = scan_tree(&config);
        drop(config);

        let _ = progress_handle.join();

        let scan_state = app_handle.state::<AppState>();

        match result {
            Ok(tree) => {
                let result_dto = ScanResultDto::from_scan_tree(&tree);
                {
                    let mut stored = scan_state.scan_tree.lock().unwrap();
                    *stored = Some(tree);
                }
                scan_state.scanning.store(false, Ordering::SeqCst);
                let _ = app_handle.emit("scan-complete", result_dto);
            }
            Err(e) => {
                scan_state.scanning.store(false, Ordering::SeqCst);
                let _ = app_handle.emit("scan-error", e.to_string());
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn get_children(app: AppHandle, node_id: usize) -> Result<Vec<ScanNodeDto>, String> {
    let state = app.state::<AppState>();
    let tree_guard = state.scan_tree.lock().unwrap();
    let tree = tree_guard.as_ref().ok_or("No scan data available")?;

    let node = tree
        .nodes
        .get(node_id)
        .ok_or("Invalid node ID")?;

    let children: Vec<ScanNodeDto> = node
        .children
        .iter()
        .filter_map(|&child_id| tree.nodes.get(child_id))
        .map(ScanNodeDto::from_scan_node)
        .collect();

    Ok(children)
}

#[tauri::command]
pub fn get_node_path(app: AppHandle, node_id: usize) -> Result<String, String> {
    let state = app.state::<AppState>();
    let tree_guard = state.scan_tree.lock().unwrap();
    let tree = tree_guard.as_ref().ok_or("No scan data available")?;

    if node_id >= tree.nodes.len() {
        return Err("Invalid node ID".into());
    }

    Ok(tree.absolute_path(node_id).to_string_lossy().into_owned())
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(
                std::path::Path::new(&path)
                    .parent()
                    .unwrap_or(std::path::Path::new(&path)),
            )
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_scan_result(app: AppHandle) -> Result<ScanResultDto, String> {
    let state = app.state::<AppState>();
    let tree_guard = state.scan_tree.lock().unwrap();
    let tree = tree_guard.as_ref().ok_or("No scan data available")?;
    Ok(ScanResultDto::from_scan_tree(tree))
}

fn num_cpus() -> usize {
    thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}
