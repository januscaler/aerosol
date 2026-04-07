mod recovery_bridge;

use aerosol_core::cleanup;
use tauri::Emitter;
use aerosol_core::duplicates::find_duplicates;
use aerosol_core::engine;
use aerosol_core::plugin::DiskPlugin;
use aerosol_core::types::{
    CleanRequest, EnrichedFinding, RiskLevel, ScanOptions, ScanResult, ScanResultBrief,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

struct ScanCoordinator(Mutex<Option<Arc<AtomicBool>>>);

impl ScanCoordinator {
    fn new() -> Self {
        Self(Mutex::new(None))
    }

    fn prepare(&self) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        *self.0.lock().expect("scan lock") = Some(flag.clone());
        flag
    }

    fn cancel_current(&self) {
        if let Some(f) = self.0.lock().expect("scan lock").as_ref() {
            f.store(true, Ordering::Relaxed);
        }
    }

    fn clear(&self) {
        *self.0.lock().expect("scan lock") = None;
    }
}

/// Full scan kept in Rust; UI requests pages by risk to avoid huge IPC / RAM in the webview.
struct CachedScan {
    findings: Arc<Vec<EnrichedFinding>>,
    idx_safe: Vec<usize>,
    idx_review: Vec<usize>,
    idx_dangerous: Vec<usize>,
}

impl CachedScan {
    fn new(findings: Vec<EnrichedFinding>) -> (Self, usize, usize, usize) {
        let mut idx_safe = Vec::new();
        let mut idx_review = Vec::new();
        let mut idx_dangerous = Vec::new();
        for (i, f) in findings.iter().enumerate() {
            match f.entry.risk {
                RiskLevel::Safe => idx_safe.push(i),
                RiskLevel::Review => idx_review.push(i),
                RiskLevel::Dangerous => idx_dangerous.push(i),
            }
        }
        let safe_len = idx_safe.len();
        let review_len = idx_review.len();
        let dangerous_len = idx_dangerous.len();
        (
            Self {
                findings: Arc::new(findings),
                idx_safe,
                idx_review,
                idx_dangerous,
            },
            safe_len,
            review_len,
            dangerous_len,
        )
    }

    fn indices(&self, filter: &str) -> Result<&[usize], String> {
        match filter {
            "safe" => Ok(&self.idx_safe),
            "review" => Ok(&self.idx_review),
            "dangerous" => Ok(&self.idx_dangerous),
            _ => Err(format!("unknown filter: {filter}")),
        }
    }

    fn page(&self, filter: &str, offset: usize, limit: usize) -> Result<Vec<EnrichedFinding>, String> {
        let limit = limit.clamp(1, 250);
        if filter == "all" {
            if offset >= self.findings.len() {
                return Ok(Vec::new());
            }
            let end = (offset + limit).min(self.findings.len());
            return Ok(self.findings[offset..end].to_vec());
        }
        let idxs = self.indices(filter)?;
        if offset >= idxs.len() {
            return Ok(Vec::new());
        }
        let end = (offset + limit).min(idxs.len());
        Ok(idxs[offset..end]
            .iter()
            .map(|&i| self.findings[i].clone())
            .collect())
    }

    fn paths_page(&self, filter: &str, offset: usize, limit: usize) -> Result<Vec<String>, String> {
        let limit = limit.clamp(1, 10_000);
        if filter == "all" {
            if offset >= self.findings.len() {
                return Ok(Vec::new());
            }
            let end = (offset + limit).min(self.findings.len());
            return Ok(self.findings[offset..end]
                .iter()
                .map(|f| f.entry.path.clone())
                .collect());
        }
        let idxs = self.indices(filter)?;
        if offset >= idxs.len() {
            return Ok(Vec::new());
        }
        let end = (offset + limit).min(idxs.len());
        Ok(idxs[offset..end]
            .iter()
            .map(|&i| self.findings[i].entry.path.clone())
            .collect())
    }
}

struct ScanFindingsCache(Mutex<Option<CachedScan>>);

impl ScanFindingsCache {
    fn new() -> Self {
        Self(Mutex::new(None))
    }

    /// Returns `(safe_len, review_len, dangerous_len)` for the brief.
    fn replace(&self, findings: Vec<EnrichedFinding>) -> (usize, usize, usize) {
        let (cached, s, r, d) = CachedScan::new(findings);
        *self.0.lock().expect("findings lock") = Some(cached);
        (s, r, d)
    }

    fn clear(&self) {
        *self.0.lock().expect("findings lock") = None;
    }

    /// Drop findings under removed paths; rebuild indices and summary fields for the UI.
    fn prune_removed_roots(
        &self,
        removed_paths: &[String],
        large_file_threshold_bytes: u64,
        large_file_top_n: usize,
        scan_stopped_reason: Option<String>,
    ) -> Result<ScanResultBrief, String> {
        let mut guard = self
            .0
            .lock()
            .map_err(|e| format!("findings lock: {e}"))?;
        let Some(cached_ref) = guard.as_ref() else {
            return Err("No scan in memory. Run a scan first.".to_string());
        };
        if removed_paths.is_empty() {
            return Ok(engine::brief_from_findings(
                cached_ref.findings.as_ref(),
                large_file_threshold_bytes,
                large_file_top_n,
                scan_stopped_reason,
            ));
        }
        let Some(cached) = guard.take() else {
            return Err("No scan in memory. Run a scan first.".to_string());
        };
        let filtered: Vec<EnrichedFinding> = cached
            .findings
            .iter()
            .filter(|f| !engine::path_matches_removed_root(&f.entry.path, removed_paths))
            .cloned()
            .collect();
        let brief = engine::brief_from_findings(
            &filtered,
            large_file_threshold_bytes,
            large_file_top_n,
            scan_stopped_reason,
        );
        let (new_cached, _, _, _) = CachedScan::new(filtered);
        *guard = Some(new_cached);
        Ok(brief)
    }

    fn page(&self, filter: String, offset: usize, limit: usize) -> Result<Vec<EnrichedFinding>, String> {
        let guard = self.0.lock().expect("findings lock");
        let c = guard
            .as_ref()
            .ok_or_else(|| "No scan in memory. Run a scan first.".to_string())?;
        c.page(&filter, offset, limit)
    }

    fn paths_page(&self, filter: String, offset: usize, limit: usize) -> Result<Vec<String>, String> {
        let guard = self.0.lock().expect("findings lock");
        let c = guard
            .as_ref()
            .ok_or_else(|| "No scan in memory. Run a scan first.".to_string())?;
        c.paths_page(&filter, offset, limit)
    }
}

#[derive(Serialize)]
struct PluginInfo {
    id: &'static str,
    name: &'static str,
    description: &'static str,
}

#[tauri::command]
fn list_plugins() -> Vec<PluginInfo> {
    use aerosol_core::plugin::builtins;
    vec![
        PluginInfo {
            id: builtins::NodePlugin.id(),
            name: builtins::NodePlugin.name(),
            description: builtins::NodePlugin.description(),
        },
        PluginInfo {
            id: builtins::DockerPlugin.id(),
            name: builtins::DockerPlugin.name(),
            description: builtins::DockerPlugin.description(),
        },
        PluginInfo {
            id: builtins::AndroidPlugin.id(),
            name: builtins::AndroidPlugin.name(),
            description: builtins::AndroidPlugin.description(),
        },
        PluginInfo {
            id: builtins::GitPlugin.id(),
            name: builtins::GitPlugin.name(),
            description: builtins::GitPlugin.description(),
        },
    ]
}

#[tauri::command]
fn default_scan_options() -> ScanOptions {
    ScanOptions::default()
}

#[tauri::command]
async fn scan_disk(
    app: tauri::AppHandle,
    options: ScanOptions,
    coordinator: tauri::State<'_, ScanCoordinator>,
    findings_cache: tauri::State<'_, ScanFindingsCache>,
) -> Result<ScanResultBrief, String> {
    let cancel = coordinator.prepare();
    let app_emit = app.clone();
    let res = tokio::task::spawn_blocking(move || {
        engine::scan_with_progress(options, cancel, move |p| {
            let app2 = app_emit.clone();
            tauri::async_runtime::spawn(async move {
                let _ = app2.emit("scan-progress", &p);
            });
        })
    })
    .await
    .map_err(|e| e.to_string());
    coordinator.clear();
    match res {
        Ok(Ok(scan)) => {
            let ScanResult {
                findings,
                totals,
                large_files,
                by_category,
                scan_stopped_reason,
            } = scan;
            let findings_len = findings.len();
            let (safe_len, review_len, dangerous_len) = findings_cache.replace(findings);
            Ok(ScanResultBrief {
                totals,
                large_files,
                by_category,
                scan_stopped_reason,
                findings_len,
                safe_len,
                review_len,
                dangerous_len,
            })
        }
        Ok(Err(e)) => {
            findings_cache.clear();
            Err(e.to_string())
        }
        Err(e) => {
            findings_cache.clear();
            Err(e.to_string())
        }
    }
}

/// Paginated rows for the list UI (`filter`: `all` | `safe` | `review` | `dangerous`).
#[tauri::command]
fn get_scan_findings_page(
    filter: String,
    offset: usize,
    limit: usize,
    findings_cache: tauri::State<'_, ScanFindingsCache>,
) -> Result<Vec<EnrichedFinding>, String> {
    findings_cache.page(filter, offset, limit)
}

/// Path strings only — for bulk selection without shipping full rows over IPC.
#[tauri::command]
fn get_scan_paths_page(
    filter: String,
    offset: usize,
    limit: usize,
    findings_cache: tauri::State<'_, ScanFindingsCache>,
) -> Result<Vec<String>, String> {
    findings_cache.paths_page(filter, offset, limit)
}

#[tauri::command]
fn cancel_scan(coordinator: tauri::State<'_, ScanCoordinator>) {
    coordinator.cancel_current();
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PruneScanAfterCleanupArgs {
    removed_paths: Vec<String>,
    large_file_threshold_bytes: u64,
    large_file_top_n: usize,
    scan_stopped_reason: Option<String>,
}

#[tauri::command]
fn prune_scan_after_cleanup(
    args: PruneScanAfterCleanupArgs,
    findings_cache: tauri::State<'_, ScanFindingsCache>,
) -> Result<ScanResultBrief, String> {
    findings_cache.prune_removed_roots(
        &args.removed_paths,
        args.large_file_threshold_bytes,
        args.large_file_top_n,
        args.scan_stopped_reason,
    )
}

#[tauri::command]
async fn run_cleanup(
    app: tauri::AppHandle,
    request: CleanRequest,
) -> Result<aerosol_core::types::CleanResult, String> {
    let app_emit = app.clone();
    tokio::task::spawn_blocking(move || {
        cleanup::clean_with_progress(request, move |ev| {
            let _ = app_emit.emit("cleanup-progress", &ev);
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn run_duplicate_check(
    paths: Vec<String>,
    min_bytes: u64,
) -> Result<Vec<aerosol_core::duplicates::DuplicateGroup>, String> {
    let pb: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    find_duplicates(&pb, min_bytes).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ScanCoordinator::new())
        .manage(ScanFindingsCache::new())
        .manage(recovery_bridge::RecoveryCoordinator::new())
        .manage(recovery_bridge::RecoveryHitsCache::new())
        .invoke_handler(tauri::generate_handler![
            list_plugins,
            default_scan_options,
            scan_disk,
            get_scan_findings_page,
            get_scan_paths_page,
            cancel_scan,
            prune_scan_after_cleanup,
            run_cleanup,
            run_duplicate_check,
            recovery_bridge::recovery_list_volumes,
            recovery_bridge::recovery_run_scan,
            recovery_bridge::recovery_cancel_scan,
            recovery_bridge::recovery_hits_page,
            recovery_bridge::recovery_hits_len,
            recovery_bridge::recovery_recover_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
