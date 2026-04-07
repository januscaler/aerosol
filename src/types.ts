/** Mirrors `aerosol_core` serde (snake_case). */

export type RiskLevel = "safe" | "review" | "dangerous";

export type JunkCategory =
  | "dev_cache"
  | "system_cache"
  | "build_artifact"
  | "package_manager"
  | "container"
  | "log"
  | "large_file"
  | "unknown";

export type ScanScope = "recommended" | "full_home";

export interface FileEntry {
  path: string;
  size_bytes: number;
  is_dir: boolean;
  modified: string | null;
  category: JunkCategory;
  risk: RiskLevel;
  source_rule: string | null;
  plugin_id: string | null;
}

export interface AiSuggestion {
  confidence: number;
  suggested_risk: RiskLevel;
  rationale: string;
  heavy_file_score: number;
}

export interface EnrichedFinding {
  entry: FileEntry;
  ai: AiSuggestion;
}

export interface ScanTotals {
  total_bytes: number;
  safe_bytes: number;
  review_bytes: number;
  dangerous_bytes: number;
  file_count: number;
}

export interface CategoryRollup {
  category: JunkCategory;
  bytes: number;
  count: number;
}

export interface ScanResult {
  findings: EnrichedFinding[];
  totals: ScanTotals;
  large_files: EnrichedFinding[];
  by_category: CategoryRollup[];
  scan_stopped_reason: string | null;
}

/** Returned from `scan_disk`; list rows via `get_scan_findings_page`. */
export interface ScanResultBrief {
  totals: ScanTotals;
  large_files: EnrichedFinding[];
  by_category: CategoryRollup[];
  scan_stopped_reason: string | null;
  findings_len: number;
  safe_len: number;
  review_len: number;
  dangerous_len: number;
}

export interface ScanProgressPayload {
  phase: string;
  message: string;
  roots_done: number;
  roots_total: number;
  percent: number;
  items_so_far: number;
}

export interface ScanOptions {
  max_depth: number | null;
  skip_substrings: string[];
  large_file_threshold_bytes: number;
  large_file_top_n: number;
  respect_gitignore: boolean;
  include_dangerous: boolean;
  extra_roots: string[];
  scan_scope: ScanScope;
  time_budget_secs: number;
  max_entries_per_root: number;
}

/** Matches `aerosol_core::types::DEFAULT_CLEANUP_PARALLELISM`. */
export const DEFAULT_CLEANUP_PARALLELISM = 4;

export interface CleanRequest {
  paths: string[];
  dry_run: boolean;
  use_trash: boolean;
  /** Concurrent delete/trash operations (1–1000; backend clamps). */
  cleanup_parallelism: number;
}

export interface CleanResult {
  dry_run: boolean;
  removed_paths: string[];
  failed: string[];
  bytes_freed_estimate: number;
  /** Selected rows before merging nested paths (same as request length). */
  selected_path_count?: number;
  /** Distinct delete/trash operations after merging. */
  operation_count?: number;
}

/** Fired on channel `cleanup-progress` while `run_cleanup` runs. */
export interface CleanupProgressPayload {
  current: number;
  total: number;
  path: string;
  /** preparing | starting | working | ok | failed | missing */
  status: string;
}

export interface PluginInfo {
  id: string;
  name: string;
  description: string;
}

export interface DuplicateGroup {
  size_bytes: number;
  hash_hex: string;
  paths: string[];
}

/** --- File recovery (`aerosol_recovery`) --- */

export interface RecoveryVolumeInfo {
  mountPoint: string;
  name: string;
  totalBytes: number;
  availableBytes: number;
  fileSystem: string;
  isRemovable: boolean;
}

export type RecoveryScanMode = "quick" | "deep";

export interface RecoveryScanOptions {
  sourcePath: string;
  mode: RecoveryScanMode;
  enabledTypes: string[];
  maxFiles?: number;
}

export type RecoveryCategory =
  | "images"
  | "videos"
  | "archives"
  | "documents"
  | "code"
  | "developer"
  | "other";

export interface RecoveryHit {
  id: string;
  path: string;
  sizeBytes: number;
  category: RecoveryCategory;
  signatureId: string;
  recoverabilityScore: number;
  kind: string;
  developerHint: string | null;
}

export interface RecoveryProgress {
  phase: string;
  filesScanned: number;
  hitsFound: number;
  message: string;
}

export interface RecoveryScanSummary {
  hitsLen: number;
  filesScanned: number;
  durationMs: number;
}

export interface RecoveryScanOutcome {
  summary: RecoveryScanSummary;
}
