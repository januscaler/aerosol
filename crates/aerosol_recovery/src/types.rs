use serde::{Deserialize, Serialize};

fn default_max_files() -> usize {
    50_000
}

/// Mountable volume / partition (metadata — no raw writes).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryVolumeInfo {
    pub mount_point: String,
    pub name: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    /// Best-effort filesystem label (APFS, ext4, NTFS, …).
    pub file_system: String,
    pub is_removable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecoveryScanMode {
    Quick,
    Deep,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryScanOptions {
    pub source_path: String,
    pub mode: RecoveryScanMode,
    /// Empty = all known types (png, jpeg, zip, …).
    #[serde(default)]
    pub enabled_types: Vec<String>,
    /// Max files to consider (safety cap).
    #[serde(default = "default_max_files")]
    pub max_files: usize,
}

impl Default for RecoveryScanOptions {
    fn default() -> Self {
        Self {
            source_path: String::new(),
            mode: RecoveryScanMode::Quick,
            enabled_types: Vec::new(),
            max_files: 50_000,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecoveryCategory {
    Images,
    Videos,
    Archives,
    Documents,
    Code,
    Developer,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryHit {
    /// Stable id for UI selection (path or carved id).
    pub id: String,
    pub path: String,
    pub size_bytes: u64,
    pub category: RecoveryCategory,
    pub signature_id: String,
    /// 0.0–1.0 heuristic (magic match, extension, developer context).
    pub recoverability_score: f32,
    pub kind: String,
    /// e.g. "git", "node", "docker" when path hints at a project layout.
    pub developer_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryProgress {
    pub phase: String,
    pub files_scanned: u64,
    pub hits_found: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryScanSummary {
    pub hits_len: usize,
    pub files_scanned: u64,
    pub duration_ms: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryCopyRequest {
    pub hit_ids: Vec<String>,
    pub destination_dir: String,
}
