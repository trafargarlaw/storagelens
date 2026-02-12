use std::env;
use std::time::Instant;

use scanner::{ScanConfig, parse_cli, print_summary, scan_tree, validate_root};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let Some(args) = parse_cli(env::args_os())? else {
        return Ok(());
    };

    let instant = Instant::now();
    validate_root(&args.root)?;

    let config = ScanConfig {
        root: args.root.clone(),
        workers: args.workers.clamp(1, 64),
        show_progress: args.show_progress,
        progress_sender: None,
    };

    let tree = scan_tree(&config)?;
    print_summary(&tree, args.top_entries);

    if let Some(path) = args.json_output {
        println!(
            "\njson output is currently disabled (requested path: {})",
            path.display()
        );
    }

    let elapsed = instant.elapsed();
    println!("Scan completed in {:?}", elapsed);

    Ok(())
}
