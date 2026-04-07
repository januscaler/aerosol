use crate::error::Result;
use crate::scanner::dir_size;
use crate::types::{CleanRequest, CleanResult, CleanupProgressEvent};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

fn entry_size_estimate(path: &Path, cancel: &AtomicBool) -> u64 {
    if path.is_file() {
        return path.metadata().map(|m| m.len()).unwrap_or(0);
    }
    if path.is_dir() {
        return dir_size(path, cancel).unwrap_or(0);
    }
    0
}

/// Drop redundant paths when a parent is also selected so we delete the parent once
/// (fewer Trash / FS calls — especially important on macOS).
///
/// `paths` sorted lexicographically so any parent appears before its descendants; one linear
/// scan (O(n log n) total) instead of checking every path against every root.
pub fn reduce_to_minimal_paths(paths: Vec<String>) -> Vec<String> {
    let mut pb: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    pb.sort();
    pb.dedup();
    let mut minimal: Vec<PathBuf> = Vec::new();
    for p in pb {
        if let Some(last) = minimal.last() {
            if p.starts_with(last) && p != *last {
                continue;
            }
        }
        minimal.push(p);
    }
    minimal
        .sort_by_key(|p| std::cmp::Reverse(p.as_os_str().len()));
    minimal
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}

fn emit<F: FnMut(CleanupProgressEvent)>(on_progress: &mut F, current: usize, total: usize, path: &str, status: &str) {
    on_progress(CleanupProgressEvent {
        current,
        total,
        path: path.to_string(),
        status: status.to_string(),
    });
}

pub fn clean(req: CleanRequest) -> Result<CleanResult> {
    clean_with_progress(req, |_| {})
}

pub fn clean_with_progress<F>(req: CleanRequest, mut on_progress: F) -> Result<CleanResult>
where
    F: FnMut(CleanupProgressEvent),
{
    let selected_path_count = req.paths.len();
    emit(
        &mut on_progress,
        0,
        selected_path_count.max(1),
        "",
        "preparing",
    );
    let minimal = reduce_to_minimal_paths(req.paths);
    let operation_count = minimal.len();
    let cancel = AtomicBool::new(false);

    emit(
        &mut on_progress,
        0,
        operation_count.max(1),
        "",
        "starting",
    );

    let mut removed_paths = Vec::new();
    let mut failed = Vec::new();
    let mut bytes_freed_estimate = 0u64;

    for (i, pstr) in minimal.iter().enumerate() {
        let n = i + 1;
        let path = Path::new(pstr);
        if !path.exists() {
            emit(&mut on_progress, n, operation_count, pstr, "missing");
            failed.push(pstr.clone());
            continue;
        }

        emit(&mut on_progress, n, operation_count, pstr, "working");

        let est = entry_size_estimate(path, &cancel);
        if req.dry_run {
            bytes_freed_estimate += est;
            removed_paths.push(pstr.clone());
            emit(&mut on_progress, n, operation_count, pstr, "ok");
            continue;
        }

        let ok = if req.use_trash {
            trash::delete(path).is_ok()
        } else if path.is_dir() {
            fs::remove_dir_all(path).is_ok()
        } else {
            fs::remove_file(path).is_ok()
        };

        if ok {
            bytes_freed_estimate += est;
            removed_paths.push(pstr.clone());
            emit(&mut on_progress, n, operation_count, pstr, "ok");
        } else {
            failed.push(pstr.clone());
            emit(&mut on_progress, n, operation_count, pstr, "failed");
        }
    }

    Ok(CleanResult {
        dry_run: req.dry_run,
        removed_paths,
        failed,
        bytes_freed_estimate,
        selected_path_count,
        operation_count,
    })
}
