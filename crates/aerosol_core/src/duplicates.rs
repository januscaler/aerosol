//! Optional duplicate detection: size bucketing + SHA-256 (for bounded candidate sets).

use crate::error::Result;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub size_bytes: u64,
    pub hash_hex: String,
    pub paths: Vec<String>,
}

fn hash_file(path: &Path) -> std::io::Result<String> {
    let mut f = File::open(path)?;
    let mut buf = [0u8; 256 * 1024];
    let mut hasher = Sha256::new();
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Group duplicates among `candidates` (typically large files from a scan). Caps work via caller list size.
pub fn find_duplicates(candidates: &[PathBuf], min_size_bytes: u64) -> Result<Vec<DuplicateGroup>> {
    let mut by_size: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    for c in candidates {
        if let Ok(m) = c.metadata() {
            if m.is_file() && m.len() >= min_size_bytes {
                by_size.entry(m.len()).or_default().push(c.clone());
            }
        }
    }
    let mut groups: Vec<DuplicateGroup> = Vec::new();
    for (size, paths) in by_size {
        if paths.len() < 2 {
            continue;
        }
        let mut by_hash: HashMap<String, Vec<String>> = HashMap::new();
        for p in paths {
            if let Ok(h) = hash_file(&p) {
                by_hash
                    .entry(h)
                    .or_default()
                    .push(p.to_string_lossy().to_string());
            }
        }
        for (hash_hex, ps) in by_hash {
            if ps.len() >= 2 {
                groups.push(DuplicateGroup {
                    size_bytes: size,
                    hash_hex,
                    paths: ps,
                });
            }
        }
    }
    groups.sort_by(|a, b| (b.paths.len(), b.size_bytes).cmp(&(a.paths.len(), a.size_bytes)));
    Ok(groups)
}
