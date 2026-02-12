use std::env;
use std::ffi::{OsStr, OsString};
use std::io::{self, ErrorKind};
use std::path::PathBuf;
use std::thread;

#[derive(Debug)]
pub struct CliArgs {
    pub root: PathBuf,
    pub workers: usize,
    pub top_entries: usize,
    pub json_output: Option<PathBuf>,
    pub show_progress: bool,
}

pub fn parse_cli<I>(args: I) -> io::Result<Option<CliArgs>>
where
    I: IntoIterator<Item = OsString>,
{
    let mut iter = args.into_iter();
    let _program = iter.next();

    let mut root: Option<PathBuf> = None;
    let mut workers: Option<usize> = None;
    let mut top_entries: usize = 30;
    let mut json_output: Option<PathBuf> = None;
    let mut show_progress = true;

    while let Some(arg) = iter.next() {
        if arg == OsStr::new("--help") || arg == OsStr::new("-h") {
            print_usage();
            return Ok(None);
        }

        if arg == OsStr::new("--workers") {
            let value = iter
                .next()
                .ok_or_else(|| invalid_input("missing value for --workers"))?;
            workers = Some(parse_usize_flag(&value, "--workers", false)?);
            continue;
        }

        if arg == OsStr::new("--top") {
            let value = iter
                .next()
                .ok_or_else(|| invalid_input("missing value for --top"))?;
            top_entries = parse_usize_flag(&value, "--top", true)?;
            continue;
        }

        if arg == OsStr::new("--json") {
            let value = iter
                .next()
                .ok_or_else(|| invalid_input("missing value for --json"))?;
            json_output = Some(PathBuf::from(value));
            continue;
        }

        if arg == OsStr::new("--no-progress") {
            show_progress = false;
            continue;
        }

        if arg.to_string_lossy().starts_with("--") {
            return Err(invalid_input(&format!(
                "unknown flag: {}",
                arg.to_string_lossy()
            )));
        }

        if root.is_some() {
            return Err(invalid_input("only one root path can be provided"));
        }
        root = Some(PathBuf::from(arg));
    }

    let root = match root {
        Some(path) => path,
        None => env::current_dir()?,
    };

    let workers = workers.unwrap_or_else(default_worker_count);
    Ok(Some(CliArgs {
        root,
        workers,
        top_entries,
        json_output,
        show_progress,
    }))
}

pub fn print_usage() {
    println!(
        "Usage: scanner [ROOT_PATH] [--workers N] [--top N] [--json OUTPUT_PATH] [--no-progress]"
    );
    println!("  ROOT_PATH     Directory to scan (default: current directory)");
    println!("  --workers N   Number of scanner worker threads (default: CPU count, capped)");
    println!("  --top N       Show top N entries directly under root (0 hides the section)");
    println!("  --json PATH   Write a UI-friendly flat tree report to JSON");
    println!("  --no-progress Disable periodic progress updates on stderr");
}

fn parse_usize_flag(value: &OsStr, flag: &str, allow_zero: bool) -> io::Result<usize> {
    let value_text = value.to_string_lossy();
    let parsed = value_text.parse::<usize>().map_err(|_| {
        invalid_input(&format!(
            "{} expects a positive integer, got {:?}",
            flag, value
        ))
    })?;

    if !allow_zero && parsed == 0 {
        return Err(invalid_input(&format!("{} must be at least 1", flag)));
    }

    Ok(parsed)
}

fn invalid_input(message: &str) -> io::Error {
    io::Error::new(ErrorKind::InvalidInput, message.to_owned())
}

fn default_worker_count() -> usize {
    thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(8)
        .clamp(2, 32)
}
