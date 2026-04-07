use crate::error::Result;
use crate::types::ScanOptions;
use rayon::prelude::*;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;
use walkdir::WalkDir;

/// Raw filesystem hits before rule / AI enrichment (cheap to produce in parallel per root).
#[derive(Debug)]
pub enum RawScanItem {
    File { path: PathBuf, len: u64 },
    Bundle {
        path: PathBuf,
        size: u64,
        tag: &'static str,
    },
}

/// Returns true if we should aggregate this directory as a single finding and skip children.
pub fn bundle_tag(path: &Path) -> Option<&'static str> {
    let name = path.file_name()?.to_string_lossy().to_lowercase();
    if name == "node_modules" {
        return Some("node_modules");
    }
    if name == "deriveddata" {
        return Some("xcode_deriveddata");
    }
    if name == "target" {
        let parent = path.parent()?;
        if parent.join("Cargo.toml").is_file() {
            return Some("cargo_target");
        }
    }
    None
}

pub fn dir_size(path: &Path, cancel: &AtomicBool) -> std::io::Result<u64> {
    dir_size_rayon(path, cancel)
}

fn past_deadline(deadline: Option<Instant>) -> bool {
    deadline.is_some_and(|d| Instant::now() > d)
}

/// Sum file sizes under `path` using Rayon (parallel over walk entries).
pub fn dir_size_rayon(path: &Path, cancel: &AtomicBool) -> std::io::Result<u64> {
    let it = WalkDir::new(path).into_iter().filter_map(|e| e.ok());
    let sum: u64 = it
        .par_bridge()
        .map(|e| {
            if cancel.load(Ordering::Relaxed) {
                return 0;
            }
            if e.path().is_file() {
                e.metadata().map(|m| m.len()).unwrap_or(0)
            } else {
                0
            }
        })
        .sum();
    Ok(sum)
}

/// Walk one root. Stops early if `deadline` passes, `cancel` is set, or `max_entries_per_root` is hit.
pub fn walk_root_collect(
    root: &Path,
    options: &ScanOptions,
    cancel: &AtomicBool,
    deadline: Option<Instant>,
) -> Result<Vec<RawScanItem>> {
    let max_depth = options.max_depth.unwrap_or(usize::MAX);
    let max_items = options.max_entries_per_root.max(1);
    let skip = &options.skip_substrings;
    let mut out = Vec::new();
    let mut it = WalkDir::new(root)
        .max_depth(max_depth)
        .follow_links(false)
        .into_iter();

    let mut loop_count: u32 = 0;
    while let Some(res) = it.next() {
        loop_count = loop_count.wrapping_add(1);
        if loop_count % 4096 == 0 {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            if past_deadline(deadline) {
                break;
            }
        }
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        if past_deadline(deadline) {
            break;
        }
        if out.len() as u64 >= max_items {
            break;
        }

        let ent = match res {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = ent.path().to_path_buf();
        let path_str = path.to_string_lossy();
        if skip.iter().any(|s| path_str.contains(s)) {
            continue;
        }

        if path.is_dir() {
            if let Some(tag) = bundle_tag(&path) {
                if past_deadline(deadline) {
                    break;
                }
                let size = dir_size_rayon(&path, cancel).unwrap_or(0);
                if out.len() as u64 >= max_items {
                    break;
                }
                out.push(RawScanItem::Bundle {
                    path,
                    size,
                    tag,
                });
                it.skip_current_dir();
                continue;
            }
        }

        if path.is_file() {
            let len = path.metadata().map(|m| m.len()).unwrap_or(0);
            out.push(RawScanItem::File { path, len });
        }
    }
    Ok(out)
}

/// Classify bundle tag into risk/category/source (DRY with engine).
pub fn bundle_classification(tag: &str) -> (crate::types::RiskLevel, crate::types::JunkCategory, String) {
    use crate::types::{JunkCategory, RiskLevel};
    match tag {
        "node_modules" => (
            RiskLevel::Review,
            JunkCategory::BuildArtifact,
            "bundle:node_modules".into(),
        ),
        "xcode_deriveddata" => (
            RiskLevel::Safe,
            JunkCategory::DevCache,
            "bundle:xcode_deriveddata".into(),
        ),
        "cargo_target" => (
            RiskLevel::Review,
            JunkCategory::BuildArtifact,
            "bundle:cargo_target".into(),
        ),
        _ => (
            RiskLevel::Review,
            JunkCategory::Unknown,
            format!("bundle:{tag}"),
        ),
    }
}
