use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// User-facing risk tier (aligns with rule engine + AI overlay).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Safe,
    Review,
    Dangerous,
}

/// High-level bucket for UI grouping.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JunkCategory {
    DevCache,
    SystemCache,
    BuildArtifact,
    PackageManager,
    Container,
    Log,
    LargeFile,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub size_bytes: u64,
    pub is_dir: bool,
    pub modified: Option<DateTime<Utc>>,
    pub category: JunkCategory,
    pub risk: RiskLevel,
    pub source_rule: Option<String>,
    pub plugin_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSuggestion {
    /// 0.0–1.0 confidence in the suggested risk tier.
    pub confidence: f64,
    pub suggested_risk: RiskLevel,
    pub rationale: String,
    pub heavy_file_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrichedFinding {
    pub entry: FileEntry,
    pub ai: AiSuggestion,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScanTotals {
    pub total_bytes: u64,
    pub safe_bytes: u64,
    pub review_bytes: u64,
    pub dangerous_bytes: u64,
    pub file_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub findings: Vec<EnrichedFinding>,
    pub totals: ScanTotals,
    pub large_files: Vec<EnrichedFinding>,
    pub by_category: Vec<CategoryRollup>,
    /// Set when the scan stopped early (time budget, per-root cap, or cancel).
    pub scan_stopped_reason: Option<String>,
}

/// Small payload for IPC; rows are paged via `get_scan_findings_page` (see Tauri).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResultBrief {
    pub totals: ScanTotals,
    pub large_files: Vec<EnrichedFinding>,
    pub by_category: Vec<CategoryRollup>,
    pub scan_stopped_reason: Option<String>,
    pub findings_len: usize,
    pub safe_len: usize,
    pub review_len: usize,
    pub dangerous_len: usize,
}

/// Live progress for UI (emitted over Tauri events).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgressPayload {
    pub phase: String,
    pub message: String,
    pub roots_done: u32,
    pub roots_total: u32,
    /// Overall 0.0–100.0 estimate.
    pub percent: f32,
    pub items_so_far: u64,
}

/// What to scan by default. `FullHome` walks your entire home folder and can take a long time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ScanScope {
    #[default]
    Recommended,
    FullHome,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryRollup {
    pub category: JunkCategory,
    pub bytes: u64,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanOptions {
    /// Max directory depth from each root (None = unlimited).
    pub max_depth: Option<usize>,
    /// Skip paths matching any substring (case-sensitive).
    pub skip_substrings: Vec<String>,
    /// Minimum file size in bytes to include as a "large file" hint.
    pub large_file_threshold_bytes: u64,
    /// Top N largest files to return in `large_files`.
    pub large_file_top_n: usize,
    /// Respect .gitignore when walking under a git repo.
    pub respect_gitignore: bool,
    /// Include dangerous-tier paths in results (default UI hides them).
    pub include_dangerous: bool,
    /// Additional absolute paths to scan (merged with platform defaults).
    pub extra_roots: Vec<String>,
    /// Scan known cache locations only (fast). `full_home` walks `$HOME` and is much slower.
    pub scan_scope: ScanScope,
    /// Stop collecting after this many seconds (partial results are still returned).
    pub time_budget_secs: u64,
    /// Max raw file/bundle rows per root (safety valve for huge trees).
    pub max_entries_per_root: u64,
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            max_depth: Some(6),
            skip_substrings: Vec::new(),
            large_file_threshold_bytes: 50 * 1024 * 1024,
            large_file_top_n: 100,
            // Reserved: honor `.gitignore` in a future walker without breaking bundle pruning.
            respect_gitignore: false,
            include_dangerous: false,
            extra_roots: Vec::new(),
            scan_scope: ScanScope::Recommended,
            time_budget_secs: 40,
            max_entries_per_root: 100_000,
        }
    }
}

/// Default concurrent delete/trash jobs (see `CleanRequest::cleanup_parallelism`).
pub const DEFAULT_CLEANUP_PARALLELISM: u32 = 50;

/// Upper bound for `cleanup_parallelism` (UI and API clamp to this).
pub const MAX_CLEANUP_PARALLELISM: u32 = 200;

fn default_cleanup_parallelism() -> u32 {
    DEFAULT_CLEANUP_PARALLELISM
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanRequest {
    pub paths: Vec<String>,
    pub dry_run: bool,
    /// If true, send to trash instead of permanent delete.
    pub use_trash: bool,
    /// How many paths to delete/trash concurrently (1 = sequential). Clamped in the engine.
    #[serde(default = "default_cleanup_parallelism")]
    pub cleanup_parallelism: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanResult {
    pub dry_run: bool,
    pub removed_paths: Vec<String>,
    pub failed: Vec<String>,
    pub bytes_freed_estimate: u64,
    /// Paths the user had selected before collapsing parents (e.g. many files → one folder).
    #[serde(default)]
    pub selected_path_count: usize,
    /// Actual delete/trash operations performed after merging nested paths.
    #[serde(default)]
    pub operation_count: usize,
}

/// Emitted during cleanup so the UI can show per-operation progress (IPC is a single invoke).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupProgressEvent {
    pub current: usize,
    pub total: usize,
    pub path: String,
    /// `preparing` | `starting` | `working` | `ok` | `failed` | `missing`
    pub status: String,
}
