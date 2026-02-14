use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::scanner::ScanTree;

const MAX_SCAN_HISTORY: usize = 12;

pub struct CachedScan {
    pub id: String,
    pub created_at_ms: u64,
    pub tree: ScanTree,
}

pub struct ScanHistoryState {
    pub scans: VecDeque<CachedScan>,
    pub active_scan_id: Option<String>,
}

pub struct AppState {
    pub scan_history: Mutex<ScanHistoryState>,
    pub scanning: AtomicBool,
    pub next_scan_sequence: AtomicU64,
}

impl AppState {
    pub fn next_scan_id(&self) -> String {
        let now_ms = now_unix_ms();
        let seq = self.next_scan_sequence.fetch_add(1, Ordering::SeqCst);
        format!("scan-{now_ms}-{seq}")
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            scan_history: Mutex::new(ScanHistoryState {
                scans: VecDeque::new(),
                active_scan_id: None,
            }),
            scanning: AtomicBool::new(false),
            next_scan_sequence: AtomicU64::new(1),
        }
    }
}

impl ScanHistoryState {
    pub fn insert_scan(&mut self, scan: CachedScan) {
        self.active_scan_id = Some(scan.id.clone());
        self.scans.push_front(scan);
        while self.scans.len() > MAX_SCAN_HISTORY {
            self.scans.pop_back();
        }
    }

    pub fn active_scan(&self) -> Option<&CachedScan> {
        let id = self.active_scan_id.as_deref()?;
        self.scans.iter().find(|scan| scan.id == id)
    }
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
