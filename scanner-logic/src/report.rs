use std::fs;
use std::io::{self, BufWriter, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::model::{ErrorCounts, NodeKind, ScanNode, ScanTree};

pub fn aggregate_errors(nodes: &[ScanNode]) -> ErrorCounts {
    let mut total = ErrorCounts::default();
    for node in nodes.iter().filter(|node| node.kind == NodeKind::Directory) {
        total.denied = total.denied.saturating_add(node.errors.denied);
        total.missing = total.missing.saturating_add(node.errors.missing);
        total.symlinks = total.symlinks.saturating_add(node.errors.symlinks);
        total.other = total.other.saturating_add(node.errors.other);
    }
    total
}

pub fn print_summary(tree: &ScanTree, top_entries: usize) {
    let directory_count = tree.count_by_kind(NodeKind::Directory);
    let file_count = tree.count_by_kind(NodeKind::File);
    let errors = aggregate_errors(&tree.nodes);

    println!("root: {}", tree.root_path.display());
    println!(
        "elapsed: {:.2?} | directories: {} | files: {}",
        tree.elapsed, directory_count, file_count
    );
    println!(
        "total recursive size: {} ({})",
        tree.root().size_bytes,
        human_bytes(tree.root().size_bytes)
    );

    println!(
        "entry issues: denied={} missing={} symlinks={} other={}",
        errors.denied, errors.missing, errors.symlinks, errors.other
    );

    if top_entries == 0 || tree.root().children.is_empty() {
        return;
    }

    println!("\nLargest entries directly under root:");
    for child_id in tree.root().children.iter().take(top_entries) {
        let child = &tree.nodes[*child_id];
        println!(
            "{:>10}  {:<9}  {}",
            human_bytes(child.size_bytes),
            child.kind.as_str(),
            tree.absolute_path(*child_id).display()
        );
    }
}

pub fn write_json_report(tree: &ScanTree, output_path: &Path) -> io::Result<()> {
    let file = fs::File::create(output_path)?;
    let mut writer = BufWriter::new(file);

    writeln!(writer, "{{")?;
    write!(writer, "  \"root_path\": ")?;
    write_json_string(&mut writer, &tree.root_path.to_string_lossy())?;
    writeln!(writer, ",")?;
    writeln!(writer, "  \"root_id\": {},", tree.root_id)?;
    writeln!(
        writer,
        "  \"scanned_directories\": {},",
        tree.scanned_directories
    )?;
    writeln!(writer, "  \"elapsed_ms\": {},", tree.elapsed.as_millis())?;
    let scanned_at_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    writeln!(writer, "  \"scanned_at_unix\": {},", scanned_at_unix)?;
    writeln!(writer, "  \"nodes\": [")?;

    for (index, node) in tree.nodes.iter().enumerate() {
        writeln!(writer, "    {{")?;
        writeln!(writer, "      \"id\": {},", node.id)?;
        match node.parent_id {
            Some(parent_id) => writeln!(writer, "      \"parent_id\": {},", parent_id)?,
            None => writeln!(writer, "      \"parent_id\": null,")?,
        }

        write!(writer, "      \"kind\": ")?;
        write_json_string(&mut writer, node.kind.as_str())?;
        writeln!(writer, ",")?;

        write!(writer, "      \"name\": ")?;
        write_json_string(&mut writer, &node.name.to_string_lossy())?;
        writeln!(writer, ",")?;

        writeln!(writer, "      \"size_bytes\": {},", node.size_bytes)?;
        writeln!(
            writer,
            "      \"direct_size_bytes\": {},",
            node.direct_size_bytes
        )?;

        write!(writer, "      \"children\": [")?;
        for (child_idx, child_id) in node.children.iter().enumerate() {
            if child_idx > 0 {
                write!(writer, ", ")?;
            }
            write!(writer, "{child_id}")?;
        }
        writeln!(writer, "],")?;

        writeln!(writer, "      \"errors\": {{")?;
        writeln!(writer, "        \"denied\": {},", node.errors.denied)?;
        writeln!(writer, "        \"missing\": {},", node.errors.missing)?;
        writeln!(writer, "        \"symlinks\": {},", node.errors.symlinks)?;
        writeln!(writer, "        \"other\": {}", node.errors.other)?;
        writeln!(writer, "      }}")?;

        if index + 1 == tree.nodes.len() {
            writeln!(writer, "    }}")?;
        } else {
            writeln!(writer, "    }},")?;
        }
    }

    writeln!(writer, "  ]")?;
    writeln!(writer, "}}")?;
    writer.flush()
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

fn write_json_string<W: Write>(writer: &mut W, value: &str) -> io::Result<()> {
    writer.write_all(b"\"")?;
    for ch in value.chars() {
        match ch {
            '"' => writer.write_all(b"\\\"")?,
            '\\' => writer.write_all(b"\\\\")?,
            '\n' => writer.write_all(b"\\n")?,
            '\r' => writer.write_all(b"\\r")?,
            '\t' => writer.write_all(b"\\t")?,
            c if c < '\u{20}' => write!(writer, "\\u{:04x}", c as u32)?,
            c => {
                let mut buffer = [0u8; 4];
                writer.write_all(c.encode_utf8(&mut buffer).as_bytes())?;
            }
        }
    }
    writer.write_all(b"\"")
}
