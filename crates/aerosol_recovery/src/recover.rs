//! Copy selected hits to a separate output directory (never in-place).

use crate::error::{RecoveryError, Result};
use crate::types::{RecoveryCopyRequest, RecoveryHit};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

/// Copy files identified by hit `id`. Skips carved virtual entries (no standalone file).
pub fn recover_hits(hits: &[RecoveryHit], req: &RecoveryCopyRequest) -> Result<Vec<String>> {
    let dest = Path::new(&req.destination_dir);
    fs::create_dir_all(dest).map_err(RecoveryError::Io)?;

    let want: HashSet<&str> = req.hit_ids.iter().map(String::as_str).collect();
    let mut written = Vec::new();

    for h in hits {
        if !want.contains(h.id.as_str()) {
            continue;
        }
        if h.kind == "carved" {
            // MVP: skip binary extract; user sees hint in UI.
            continue;
        }
        let src = Path::new(&h.path);
        if !src.is_file() {
            continue;
        }
        let name = src
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("recovered.bin");
        let mut out = dest.join(sanitize_filename(name));
        let mut n = 0u32;
        while out.exists() {
            n += 1;
            let stem = Path::new(name).file_stem().and_then(|s| s.to_str()).unwrap_or("file");
            let ext = Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("");
            let new_name = if ext.is_empty() {
                format!("{stem}_r{n}")
            } else {
                format!("{stem}_r{n}.{ext}")
            };
            out = dest.join(new_name);
        }
        fs::copy(src, &out).map_err(RecoveryError::Io)?;
        written.push(out.to_string_lossy().to_string());
    }

    Ok(written)
}

fn sanitize_filename(name: &str) -> String {
    let bad = ['/', '\\', ':', '<', '>', '"', '|', '?', '*'];
    name.chars()
        .map(|c| if bad.contains(&c) { '_' } else { c })
        .collect()
}
