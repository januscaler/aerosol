use crate::error::{RecoveryError, Result};
use crate::reconstruct;
use crate::signatures::{self, FileSignature};
use crate::types::{RecoveryCategory, RecoveryHit, RecoveryScanMode, RecoveryScanOptions};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use walkdir::WalkDir;

const READ_PREFIX: usize = 512;

fn category_for_sig(sig_id: &str) -> RecoveryCategory {
    match sig_id {
        "png" | "jpeg" => RecoveryCategory::Images,
        "mp4" => RecoveryCategory::Videos,
        "zip" | "pdf" => RecoveryCategory::Archives,
        "json" => RecoveryCategory::Documents,
        "sqlite" => RecoveryCategory::Documents,
        _ => RecoveryCategory::Other,
    }
}

fn score_for(prefix_match: bool, ext_match: bool, dev: bool) -> f32 {
    match (prefix_match, ext_match, dev) {
        (true, true, _) => 0.95,
        (true, false, _) => 0.75,
        (false, true, _) => 0.65,
        (_, _, true) => 0.55,
        _ => 0.4,
    }
}

fn read_prefix(path: &Path, buf: &mut [u8]) -> Result<usize> {
    let mut f = File::open(path)?;
    let n = f.read(buf)?;
    Ok(n)
}

/// Classify a single file on disk (read-only).
pub fn classify_file(path: &Path, sigs: &[FileSignature]) -> Result<Option<RecoveryHit>> {
    let meta = std::fs::metadata(path)?;
    if !meta.is_file() {
        return Ok(None);
    }
    let size = meta.len();
    let mut buf = [0u8; READ_PREFIX];
    let n = read_prefix(path, &mut buf)?;
    let slice = &buf[..n];
    let (magic, ext_sig) = signatures::classify_prefix_and_ext(path, slice, sigs);
    let path_str = path.to_string_lossy().to_string();
    let dev = reconstruct::developer_hint(&path_str);
    let dev_flag = dev.is_some() || reconstruct::looks_like_project_path(path);

    let (sig_id, category, score) = if let Some(m) = magic {
        let ext_m = ext_sig.map(|e| e.id == m.id).unwrap_or(false);
        let cat = if dev_flag && matches!(m.id, "json" | "zip" | "sqlite") {
            RecoveryCategory::Developer
        } else {
            category_for_sig(m.id)
        };
        (
            m.id.to_string(),
            cat,
            score_for(true, ext_m, dev_flag),
        )
    } else if let Some(e) = ext_sig {
        (
            e.id.to_string(),
            if dev_flag {
                RecoveryCategory::Developer
            } else {
                category_for_sig(e.id)
            },
            score_for(false, true, dev_flag),
        )
    } else if dev_flag {
        (
            "unknown".into(),
            RecoveryCategory::Developer,
            0.35,
        )
    } else {
        return Ok(None);
    };

    let id = path_str.clone();
    Ok(Some(RecoveryHit {
        id,
        path: path_str,
        size_bytes: size,
        category,
        signature_id: sig_id,
        recoverability_score: score,
        kind: "file".into(),
        developer_hint: dev,
    }))
}

/// Walk directory tree and collect hits (quick + optional deep carve).
/// Returns `(hits, files_seen)`.
pub fn scan_tree(
    options: &RecoveryScanOptions,
    cancel: &AtomicBool,
    mut on_progress: impl FnMut(u64, usize, &str),
) -> Result<(Vec<RecoveryHit>, u64)> {
    let root = PathBuf::from(&options.source_path);
    if !root.exists() {
        return Err(RecoveryError::Msg(format!(
            "Source path does not exist: {}",
            options.source_path
        )));
    }
    let sigs = signatures::enabled_signatures(&options.enabled_types);

    let mut hits: Vec<RecoveryHit> = Vec::new();
    let mut scanned: u64 = 0;

    for entry in WalkDir::new(&root)
        .max_depth(32)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if cancel.load(Ordering::Relaxed) {
            return Err(RecoveryError::Cancelled);
        }
        if hits.len() >= options.max_files {
            break;
        }
        let path = entry.path();
        if !entry.file_type().is_file() {
            continue;
        }
        scanned += 1;
        if scanned.is_multiple_of(200) {
            on_progress(scanned, hits.len(), path.to_string_lossy().as_ref());
        }

        match classify_file(path, &sigs) {
            Ok(Some(h)) => hits.push(h),
            Ok(None) => {}
            Err(_) => continue,
        }

        if options.mode == RecoveryScanMode::Deep {
            if let Ok(offs) = crate::carving::carve_file_head(path, &sigs) {
                let path_str = path.to_string_lossy().to_string();
                for (off, sig) in offs {
                    if off == 0 {
                        continue;
                    }
                    let id = format!("{path_str}#0x{off:x}#{}", sig.id);
                    hits.push(RecoveryHit {
                        id: id.clone(),
                        path: path_str.clone(),
                        size_bytes: off as u64,
                        category: category_for_sig(sig.id),
                        signature_id: sig.id.to_string(),
                        recoverability_score: 0.5,
                        kind: "carved".into(),
                        developer_hint: None,
                    });
                    if hits.len() >= options.max_files {
                        break;
                    }
                }
            }
        }
    }

    on_progress(scanned, hits.len(), "done");
    Ok((hits, scanned))
}
