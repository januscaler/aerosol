use std::path::PathBuf;

/// Conservative defaults: user home + temp (platform-specific joined in `all_scan_roots`).
pub fn default_scan_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(h) = dirs::home_dir() {
        roots.push(h);
    }
    if let Some(c) = dirs::cache_dir() {
        roots.push(c);
    }
    roots
}
