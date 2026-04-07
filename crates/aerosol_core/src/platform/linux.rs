use std::path::PathBuf;

pub fn extra_scan_roots() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(h) = dirs::home_dir() {
        v.push(h.join(".cache"));
        v.push(PathBuf::from("/var/cache"));
    }
    v
}
