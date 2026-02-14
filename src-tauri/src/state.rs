use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use crate::scanner::ScanTree;

pub struct AppState {
    pub scan_tree: Mutex<Option<ScanTree>>,
    pub scanning: AtomicBool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            scan_tree: Mutex::new(None),
            scanning: AtomicBool::new(false),
        }
    }
}
