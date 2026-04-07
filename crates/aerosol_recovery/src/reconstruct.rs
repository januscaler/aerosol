//! Developer-aware path hints (project fragments, not full reconstruction yet).

use std::path::Path;

/// Best-effort label when a path smells like part of a developer tree.
pub fn developer_hint(path: &str) -> Option<String> {
    let p = path.replace('\\', "/").to_ascii_lowercase();
    if p.contains("/.git/") || p.ends_with("/.git") {
        return Some("Git repository data".into());
    }
    if p.ends_with("/package.json") || p.contains("/node_modules/") {
        return Some("Node / JavaScript project".into());
    }
    if p.ends_with("/dockerfile") || p.ends_with("/docker-compose.yml") || p.ends_with("/docker-compose.yaml") {
        return Some("Docker".into());
    }
    if p.ends_with("/cargo.toml") || p.contains("/target/") {
        return Some("Rust project".into());
    }
    if p.ends_with("/pyproject.toml") || p.ends_with("/requirements.txt") {
        return Some("Python project".into());
    }
    if p.ends_with("/.env") || p.ends_with("/.env.local") {
        return Some("Environment file (handle carefully)".into());
    }
    None
}

/// True if path is under a typical project root marker (shallow check).
pub fn looks_like_project_path(path: &Path) -> bool {
    developer_hint(&path.to_string_lossy()).is_some()
}
