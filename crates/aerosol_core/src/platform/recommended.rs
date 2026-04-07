//! Fast default scan targets — known dev/package caches only (not your entire home folder).

use std::path::PathBuf;

fn push_if_exists(v: &mut Vec<PathBuf>, p: PathBuf) {
    if p.exists() {
        v.push(p);
    }
}

/// Curated list of paths that are usually safe to inspect quickly. Only directories that exist are returned.
pub fn recommended_roots() -> Vec<PathBuf> {
    let mut v = Vec::new();
    let Some(home) = dirs::home_dir() else {
        return v;
    };

    // Cross-platform caches under home
    push_if_exists(&mut v, home.join(".cache"));
    push_if_exists(&mut v, home.join(".npm"));
    push_if_exists(&mut v, home.join(".yarn"));
    push_if_exists(&mut v, home.join(".cache/yarn"));
    push_if_exists(&mut v, home.join(".cache/pip"));
    push_if_exists(&mut v, home.join(".cache/uv"));
    push_if_exists(&mut v, home.join(".local/share/pnpm"));
    push_if_exists(&mut v, home.join(".gradle/caches"));
    push_if_exists(&mut v, home.join(".android/cache"));
    push_if_exists(&mut v, home.join(".cargo/registry"));
    push_if_exists(&mut v, home.join(".cargo/git"));
    push_if_exists(&mut v, home.join(".rustup/tmp"));

    // Only add OS temp when it lives under this user (skip system-wide `/tmp` on Linux).
    let tmp = std::env::temp_dir();
    if tmp.starts_with(&home) {
        push_if_exists(&mut v, tmp);
    }

    #[cfg(target_os = "macos")]
    {
        push_if_exists(&mut v, home.join("Library/Caches"));
        push_if_exists(&mut v, home.join("Library/Developer/Xcode/DerivedData"));
        push_if_exists(&mut v, home.join("Library/Caches/Homebrew"));
        push_if_exists(&mut v, home.join("Library/Caches/pip"));
    }

    #[cfg(target_os = "linux")]
    {
        push_if_exists(&mut v, PathBuf::from("/tmp"));
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let base = PathBuf::from(local);
            push_if_exists(&mut v, base.join("npm-cache"));
            push_if_exists(&mut v, base.join("Temp"));
        }
    }

    v.sort();
    v.dedup();
    v
}
