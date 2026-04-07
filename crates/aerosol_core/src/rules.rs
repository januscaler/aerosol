//! Declarative path rules (DRY). Plugins can add more via the same [`Rule`] type.

use crate::types::{JunkCategory, RiskLevel};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct Rule {
    pub id: &'static str,
    pub name: &'static str,
    pub risk: RiskLevel,
    pub category: JunkCategory,
    /// Path must contain this substring (normalized with separators).
    pub path_contains: &'static str,
    /// Optional suffix check for files only.
    pub suffix: Option<&'static str>,
}

/// Built-in rules ordered: more specific matches should be checked first by the engine
/// (we iterate in order; first match wins in `match_rule`).
pub fn builtin_rules() -> Vec<Rule> {
    vec![
        // Dangerous — user data (never auto-clean)
        Rule {
            id: "user_documents",
            name: "User documents area",
            risk: RiskLevel::Dangerous,
            category: JunkCategory::Unknown,
            path_contains: "/Documents/",
            suffix: None,
        },
        Rule {
            id: "user_desktop",
            name: "Desktop",
            risk: RiskLevel::Dangerous,
            category: JunkCategory::Unknown,
            path_contains: "/Desktop/",
            suffix: None,
        },
        Rule {
            id: "ssh_keys",
            name: "SSH keys",
            risk: RiskLevel::Dangerous,
            category: JunkCategory::Unknown,
            path_contains: "/.ssh/",
            suffix: None,
        },
        // Review — large / project-local
        Rule {
            id: "node_modules",
            name: "node_modules",
            risk: RiskLevel::Review,
            category: JunkCategory::BuildArtifact,
            path_contains: "/node_modules/",
            suffix: None,
        },
        Rule {
            id: "cargo_target",
            name: "Rust target/ build dir",
            risk: RiskLevel::Review,
            category: JunkCategory::BuildArtifact,
            path_contains: "/target/",
            suffix: None,
        },
        Rule {
            id: "gradle_build",
            name: "Gradle build output",
            risk: RiskLevel::Review,
            category: JunkCategory::BuildArtifact,
            path_contains: "/build/",
            suffix: None,
        },
        // Safe — typical caches
        Rule {
            id: "npm_cache",
            name: "npm cache",
            risk: RiskLevel::Safe,
            category: JunkCategory::PackageManager,
            path_contains: "/.npm/",
            suffix: None,
        },
        Rule {
            id: "yarn_cache",
            name: "Yarn cache",
            risk: RiskLevel::Safe,
            category: JunkCategory::PackageManager,
            path_contains: "/.cache/yarn",
            suffix: None,
        },
        Rule {
            id: "pnpm_store",
            name: "pnpm store",
            risk: RiskLevel::Review,
            category: JunkCategory::PackageManager,
            path_contains: "/.local/share/pnpm",
            suffix: None,
        },
        Rule {
            id: "pip_cache",
            name: "pip cache",
            risk: RiskLevel::Safe,
            category: JunkCategory::PackageManager,
            path_contains: "/.cache/pip",
            suffix: None,
        },
        Rule {
            id: "uv_cache",
            name: "uv cache",
            risk: RiskLevel::Safe,
            category: JunkCategory::PackageManager,
            path_contains: "/.cache/uv",
            suffix: None,
        },
        Rule {
            id: "home_cache",
            name: "User cache",
            risk: RiskLevel::Safe,
            category: JunkCategory::SystemCache,
            path_contains: "/.cache/",
            suffix: None,
        },
        Rule {
            id: "xcode_derived",
            name: "Xcode DerivedData",
            risk: RiskLevel::Safe,
            category: JunkCategory::DevCache,
            path_contains: "/Library/Developer/Xcode/DerivedData",
            suffix: None,
        },
        Rule {
            id: "xcode_archives",
            name: "Xcode Archives",
            risk: RiskLevel::Review,
            category: JunkCategory::DevCache,
            path_contains: "/Library/Developer/Xcode/Archives",
            suffix: None,
        },
        Rule {
            id: "docker_raw",
            name: "Docker data (raw)",
            risk: RiskLevel::Review,
            category: JunkCategory::Container,
            path_contains: "/Docker.raw",
            suffix: None,
        },
        Rule {
            id: "homebrew_cache",
            name: "Homebrew cache",
            risk: RiskLevel::Safe,
            category: JunkCategory::PackageManager,
            path_contains: "/Library/Caches/Homebrew",
            suffix: None,
        },
        Rule {
            id: "npm_logs",
            name: "npm logs",
            risk: RiskLevel::Safe,
            category: JunkCategory::Log,
            path_contains: "/.npm/_logs",
            suffix: None,
        },
        Rule {
            id: "log_files",
            name: "Log files",
            risk: RiskLevel::Safe,
            category: JunkCategory::Log,
            path_contains: "/",
            suffix: Some(".log"),
        },
    ]
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
}

/// Returns first matching rule for a path.
pub fn match_rule<'r>(path: &Path, rules: &'r [Rule]) -> Option<&'r Rule> {
    let s = normalize_path(&path.to_string_lossy());
    for rule in rules {
        if !s.contains(rule.path_contains) {
            continue;
        }
        if let Some(suf) = rule.suffix {
            if !s.ends_with(suf) {
                continue;
            }
        }
        return Some(rule);
    }
    None
}
