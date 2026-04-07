//! Coordinates disk listing and scan phases (future: raw device + FS parsers).

pub use crate::disk::list_volumes;
use crate::scanner::scan_tree;
use crate::types::{RecoveryProgress, RecoveryScanOptions, RecoveryScanSummary};
use std::sync::atomic::AtomicBool;
use std::time::Instant;

pub fn run_scan(
    options: RecoveryScanOptions,
    cancel: &AtomicBool,
    mut on_progress: impl FnMut(RecoveryProgress),
) -> crate::error::Result<(Vec<crate::types::RecoveryHit>, RecoveryScanSummary)> {
    let start = Instant::now();
    let mut last_emit_hits = 0usize;
    let (hits, files_scanned) = scan_tree(&options, cancel, |files, hits_found, msg| {
        if hits_found != last_emit_hits || files.is_multiple_of(2000) {
            last_emit_hits = hits_found;
            on_progress(RecoveryProgress {
                phase: "scanning".into(),
                files_scanned: files,
                hits_found,
                message: msg.to_string(),
            });
        }
    })?;
    let duration_ms = start.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;
    let summary = RecoveryScanSummary {
        hits_len: hits.len(),
        files_scanned,
        duration_ms,
    };
    Ok((hits, summary))
}
