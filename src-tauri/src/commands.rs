use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::mpsc;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use sysinfo::Disks;
use tauri::{AppHandle, Emitter, Manager};

use crate::models::{
    ScanHistoryItemDto, ScanNodeDto, ScanProgressDto, ScanResultDto, VolumeInfo,
};
use crate::scanner::{scan_tree, validate_root, ScanConfig, ScanProgress, ScanTree};
use crate::state::{AppState, CachedScan};

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

    let app_handle = app.clone();

    thread::spawn(move || {
        let (progress_tx, progress_rx) = mpsc::channel::<ScanProgress>();

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
        scan_state.scanning.store(false, Ordering::SeqCst);

        match result {
            Ok(tree) => {
                let scan_id = scan_state.next_scan_id();
                let created_at_ms = unix_now_ms();
                let result_dto = {
                    let mut history = scan_state.scan_history.lock().unwrap();
                    history.insert_scan(CachedScan {
                        id: scan_id.clone(),
                        created_at_ms,
                        tree,
                    });
                    history
                        .active_scan()
                        .map(|scan| ScanResultDto::from_scan_tree(scan.id.clone(), &scan.tree))
                };
                if let Some(payload) = result_dto {
                    let _ = app_handle.emit("scan-complete", payload);
                } else {
                    let _ = app_handle.emit("scan-error", "Failed to cache scan result");
                }
            }
            Err(e) => {
                let _ = app_handle.emit("scan-error", e.to_string());
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn is_scanning(app: AppHandle) -> bool {
    let state = app.state::<AppState>();
    state.scanning.load(Ordering::SeqCst)
}

#[tauri::command]
pub fn list_scan_history(app: AppHandle) -> Vec<ScanHistoryItemDto> {
    let state = app.state::<AppState>();
    let history = state.scan_history.lock().unwrap();
    history
        .scans
        .iter()
        .map(|scan| {
            ScanHistoryItemDto::from_scan_tree(scan.id.clone(), scan.created_at_ms, &scan.tree)
        })
        .collect()
}

#[tauri::command]
pub fn activate_scan(app: AppHandle, id: String) -> Result<ScanResultDto, String> {
    let state = app.state::<AppState>();
    let mut history = state.scan_history.lock().unwrap();
    let found = history.scans.iter().any(|scan| scan.id == id);
    if !found {
        return Err("Scan not found".into());
    }
    history.active_scan_id = Some(id);
    let active = history.active_scan().ok_or("No scan data available")?;
    Ok(ScanResultDto::from_scan_tree(active.id.clone(), &active.tree))
}

#[tauri::command]
pub fn delete_scan(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut history = state.scan_history.lock().unwrap();
    let before_len = history.scans.len();
    history.scans.retain(|scan| scan.id != id);
    if history.scans.len() == before_len {
        return Err("Scan not found".into());
    }
    if history.active_scan_id.as_deref() == Some(id.as_str()) {
        history.active_scan_id = history.scans.front().map(|scan| scan.id.clone());
    }
    Ok(())
}

#[tauri::command]
pub fn get_children(app: AppHandle, node_id: usize) -> Result<Vec<ScanNodeDto>, String> {
    let state = app.state::<AppState>();
    with_active_tree(&state, |tree| {
        let node = tree.nodes.get(node_id).ok_or("Invalid node ID")?;
        let children: Vec<ScanNodeDto> = node
            .children
            .iter()
            .filter_map(|&child_id| tree.nodes.get(child_id))
            .map(ScanNodeDto::from_scan_node)
            .collect();
        Ok(children)
    })
}

#[tauri::command]
pub fn get_node_path(app: AppHandle, node_id: usize) -> Result<String, String> {
    let state = app.state::<AppState>();
    with_active_tree(&state, |tree| {
        if node_id >= tree.nodes.len() {
            return Err("Invalid node ID".into());
        }
        Ok(tree.absolute_path(node_id).to_string_lossy().into_owned())
    })
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
    let history = state.scan_history.lock().unwrap();
    let active = history.active_scan().ok_or("No scan data available")?;
    Ok(ScanResultDto::from_scan_tree(active.id.clone(), &active.tree))
}

fn num_cpus() -> usize {
    thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

fn unix_now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn with_active_tree<T>(
    state: &AppState,
    map: impl FnOnce(&ScanTree) -> Result<T, String>,
) -> Result<T, String> {
    let history = state.scan_history.lock().unwrap();
    let active = history.active_scan().ok_or("No scan data available")?;
    map(&active.tree)
}
