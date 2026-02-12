pub mod cli;
pub mod engine;
pub mod model;
pub mod report;

pub use cli::{CliArgs, parse_cli};
pub use engine::{scan_tree, validate_root};
pub use model::{ErrorCounts, NodeKind, ScanConfig, ScanNode, ScanProgress, ScanTree};
pub use report::{print_summary, write_json_report};
