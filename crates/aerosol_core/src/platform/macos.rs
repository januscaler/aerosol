use std::path::PathBuf;

pub fn extra_scan_roots() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(h) = dirs::home_dir() {
        v.push(h.join("Library/Caches"));
        v.push(h.join("Library/Developer/Xcode/DerivedData"));
    }
    v
}
