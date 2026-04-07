use crate::error::Result;
use crate::scanner::dir_size;
use crate::types::{CleanRequest, CleanResult, CleanupProgressEvent, MAX_CLEANUP_PARALLELISM};
use rayon::prelude::*;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

fn clamp_parallelism(req: &CleanRequest) -> usize {
    let n = req.cleanup_parallelism.max(1).min(MAX_CLEANUP_PARALLELISM);
    n as usize
}

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

struct OnePathResult {
    path: String,
    status: &'static str,
    removed: bool,
    bytes: u64,
}

fn clean_one_path(pstr: &str, dry_run: bool, use_trash: bool, cancel: &AtomicBool) -> OnePathResult {
    let path = Path::new(pstr);
    if !path.exists() {
        return OnePathResult {
            path: pstr.to_string(),
            status: "missing",
            removed: false,
            bytes: 0,
        };
    }

    let est = entry_size_estimate(path, cancel);
    if dry_run {
        return OnePathResult {
            path: pstr.to_string(),
            status: "ok",
            removed: true,
            bytes: est,
        };
    }

    let ok = if use_trash {
        trash::delete(path).is_ok()
    } else if path.is_dir() {
        fs::remove_dir_all(path).is_ok()
    } else {
        fs::remove_file(path).is_ok()
    };

    if ok {
        OnePathResult {
            path: pstr.to_string(),
            status: "ok",
            removed: true,
            bytes: est,
        }
    } else {
        OnePathResult {
            path: pstr.to_string(),
            status: "failed",
            removed: false,
            bytes: 0,
        }
    }
}

fn apply_outcome<F: FnMut(CleanupProgressEvent)>(
    on_progress: &mut F,
    n: usize,
    operation_count: usize,
    r: &OnePathResult,
    removed_paths: &mut Vec<String>,
    failed: &mut Vec<String>,
    bytes_freed_estimate: &mut u64,
) {
    emit(on_progress, n, operation_count, &r.path, "working");
    emit(on_progress, n, operation_count, &r.path, r.status);
    if r.removed {
        removed_paths.push(r.path.clone());
        *bytes_freed_estimate += r.bytes;
    }
    if r.status == "missing" || r.status == "failed" {
        failed.push(r.path.clone());
    }
}

pub fn clean(req: CleanRequest) -> Result<CleanResult> {
    clean_with_progress(req, |_| {})
}

pub fn clean_with_progress<F>(req: CleanRequest, mut on_progress: F) -> Result<CleanResult>
where
    F: FnMut(CleanupProgressEvent) + Send,
{
    let selected_path_count = req.paths.len();
    emit(
        &mut on_progress,
        0,
        selected_path_count.max(1),
        "",
        "preparing",
    );
    let par = clamp_parallelism(&req);
    let dry_run = req.dry_run;
    let use_trash = req.use_trash;
    let minimal = reduce_to_minimal_paths(req.paths);
    let operation_count = minimal.len();
    let cancel = Arc::new(AtomicBool::new(false));

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
    let use_parallel = par > 1 && operation_count > 1;

    if !use_parallel {
        for (i, pstr) in minimal.iter().enumerate() {
            let n = i + 1;
            let r = clean_one_path(pstr, dry_run, use_trash, cancel.as_ref());
            apply_outcome(
                &mut on_progress,
                n,
                operation_count,
                &r,
                &mut removed_paths,
                &mut failed,
                &mut bytes_freed_estimate,
            );
        }
    } else {
        let threads = par.min(operation_count).max(1);
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .build()
            .unwrap_or_else(|_| {
                rayon::ThreadPoolBuilder::new()
                    .num_threads(1)
                    .build()
                    .expect("rayon single-thread pool")
            });

        let on_prog = Arc::new(Mutex::new(on_progress));
        let done = Arc::new(AtomicUsize::new(0));
        let outcomes: Arc<Mutex<Vec<OnePathResult>>> = Arc::new(Mutex::new(Vec::new()));

        pool.install(|| {
            minimal.par_iter().for_each(|pstr| {
                let r = clean_one_path(pstr, dry_run, use_trash, cancel.as_ref());
                let n = done.fetch_add(1, Ordering::SeqCst) + 1;
                if let Ok(mut cb) = on_prog.lock() {
                    emit(&mut *cb, n, operation_count, &r.path, "working");
                    emit(&mut *cb, n, operation_count, &r.path, r.status);
                }
                if let Ok(mut o) = outcomes.lock() {
                    o.push(r);
                }
            });
        });

        let gathered: Vec<OnePathResult> = outcomes
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .drain(..)
            .collect();
        for r in &gathered {
            if r.removed {
                removed_paths.push(r.path.clone());
                bytes_freed_estimate += r.bytes;
            }
            if r.status == "missing" || r.status == "failed" {
                failed.push(r.path.clone());
            }
        }
    }

    Ok(CleanResult {
        dry_run,
        removed_paths,
        failed,
        bytes_freed_estimate,
        selected_path_count,
        operation_count,
    })
}
