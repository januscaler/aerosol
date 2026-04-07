use std::path::PathBuf;

pub fn extra_scan_roots() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(tmp) = std::env::var("TEMP") {
        v.push(PathBuf::from(tmp));
    }
    if let Ok(tmp) = std::env::var("LOCALAPPDATA") {
        v.push(PathBuf::from(tmp).join("Temp"));
    }
    v
}
