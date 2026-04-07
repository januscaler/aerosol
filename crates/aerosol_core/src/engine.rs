//! Single pipeline: roots → sequential walk (progress-friendly) → parallel enrich → [`ScanResult`].

use crate::ai::HeuristicClassifier;
use crate::error::{Error, Result};
use crate::platform;
use crate::plugin::{ClassifyContext, PluginRegistry};
use crate::rules::{self, Rule};
use crate::scanner::{self, RawScanItem, bundle_classification};
use crate::types::*;
use rayon::prelude::*;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

fn resolve_roots(options: &ScanOptions) -> Vec<PathBuf> {
    let mut roots = match options.scan_scope {
        ScanScope::Recommended => platform::recommended_roots(),
        ScanScope::FullHome => dirs::home_dir().into_iter().collect(),
    };
    for s in &options.extra_roots {
        roots.push(PathBuf::from(s));
    }
    let mut seen = HashSet::new();
    roots.retain(|p| seen.insert(p.clone()));
    roots
}

fn classify_path(
    path: &Path,
    size: u64,
    is_dir: bool,
    rules: &[Rule],
    plugins: &PluginRegistry,
) -> (RiskLevel, JunkCategory, Option<String>, Option<String>) {
    let ctx = ClassifyContext {
        path,
        size_bytes: size,
        is_dir,
    };
    if let Some(pc) = plugins.classify(&ctx) {
        return (
            pc.risk,
            pc.category,
            Some(pc.rule_label),
            None,
        );
    }
    if let Some(r) = rules::match_rule(path, rules) {
        return (
            r.risk,
            r.category.clone(),
            Some(r.name.to_string()),
            None,
        );
    }
    if !is_dir && size > 25 * 1024 * 1024 {
        return (
            RiskLevel::Review,
            JunkCategory::LargeFile,
            Some("large file".into()),
            None,
        );
    }
    (
        RiskLevel::Review,
        JunkCategory::Unknown,
        None,
        None,
    )
}

fn mtime_utc(path: &Path) -> Option<chrono::DateTime<chrono::Utc>> {
    let ft = path.metadata().ok()?.modified().ok()?;
    Some(chrono::DateTime::<chrono::Utc>::from(ft))
}

fn enrich_item(
    item: RawScanItem,
    rules: &[Rule],
    plugins: &PluginRegistry,
    classifier: HeuristicClassifier,
) -> EnrichedFinding {
    match item {
        RawScanItem::Bundle {
            path,
            size,
            tag,
        } => {
            let (risk, category, source) = bundle_classification(tag);
            let entry = FileEntry {
                path: path.to_string_lossy().to_string(),
                size_bytes: size,
                is_dir: true,
                modified: mtime_utc(&path),
                category,
                risk,
                source_rule: Some(source),
                plugin_id: None,
            };
            let ai = classifier.suggest(&path, size, true, risk);
            EnrichedFinding { entry, ai }
        }
        RawScanItem::File { path, len } => {
            let (risk, category, source_rule, plugin_id) =
                classify_path(&path, len, false, rules, plugins);
            let entry = FileEntry {
                path: path.to_string_lossy().to_string(),
                size_bytes: len,
                is_dir: false,
                modified: mtime_utc(&path),
                category,
                risk,
                source_rule,
                plugin_id,
            };
            let ai = classifier.suggest(&path, len, false, risk);
            EnrichedFinding { entry, ai }
        }
    }
}

const PROGRESS_MIN_INTERVAL: Duration = Duration::from_millis(120);

fn emit_progress<F: FnMut(ScanProgressPayload)>(
    last: &mut Instant,
    on_progress: &mut F,
    payload: ScanProgressPayload,
    force: bool,
) {
    if force || last.elapsed() >= PROGRESS_MIN_INTERVAL {
        on_progress(payload);
        *last = Instant::now();
    }
}

/// Scan without progress callbacks (CLI and tests).
pub fn scan(options: ScanOptions, cancel: Arc<AtomicBool>) -> Result<ScanResult> {
    scan_with_progress(options, cancel, |_| ())
}

/// Full scan with throttled progress events (`phase`: walking | analyzing | done).
pub fn scan_with_progress<F>(options: ScanOptions, cancel: Arc<AtomicBool>, mut on_progress: F) -> Result<ScanResult>
where
    F: FnMut(ScanProgressPayload) + Send,
{
    let rules = rules::builtin_rules();
    let plugins = PluginRegistry::default();
    let classifier = HeuristicClassifier::default();
    let roots = resolve_roots(&options);
    let total = roots.len().max(1) as u32;

    let budget = options.time_budget_secs.max(5);
    let deadline = Instant::now() + Duration::from_secs(budget);
    let mut last_emit = Instant::now() - PROGRESS_MIN_INTERVAL;

    let mut stopped_reason: Option<String> = None;
    let mut raw: Vec<RawScanItem> = Vec::new();

    if roots.is_empty() {
        stopped_reason = Some(
            "No folders to scan yet. Try “Full home” in Settings or add custom paths.".into(),
        );
        emit_progress(
            &mut last_emit,
            &mut on_progress,
            ScanProgressPayload {
                phase: "done".into(),
                message: stopped_reason.clone().unwrap_or_default(),
                roots_done: 0,
                roots_total: total,
                percent: 100.0,
                items_so_far: 0,
            },
            true,
        );
        return Ok(empty_result(stopped_reason));
    }

    for (i, root) in roots.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err(Error::Cancelled);
        }
        if Instant::now() > deadline {
            stopped_reason = Some(format!(
                "Stopped after {budget}s time budget (Settings). Showing partial results."
            ));
            break;
        }
        if !root.exists() {
            continue;
        }

        let msg = root.to_string_lossy().to_string();
        let pct = 70.0 * (i as f32) / (roots.len().max(1) as f32);
        emit_progress(
            &mut last_emit,
            &mut on_progress,
            ScanProgressPayload {
                phase: "walking".into(),
                message: msg.clone(),
                roots_done: i as u32,
                roots_total: total,
                percent: pct,
                items_so_far: raw.len() as u64,
            },
            true,
        );

        let part = scanner::walk_root_collect(root, &options, &cancel, Some(deadline))?;
        raw.extend(part);

        if Instant::now() > deadline {
            stopped_reason = Some(format!(
                "Stopped after {budget}s time budget (Settings). Showing partial results."
            ));
            break;
        }
    }

    if cancel.load(Ordering::Relaxed) {
        return Err(Error::Cancelled);
    }

    emit_progress(
        &mut last_emit,
        &mut on_progress,
        ScanProgressPayload {
            phase: "analyzing".into(),
            message: "Scoring files…".into(),
            roots_done: total,
            roots_total: total,
            percent: 78.0,
            items_so_far: raw.len() as u64,
        },
        true,
    );

    let mut findings: Vec<EnrichedFinding> = raw
        .into_par_iter()
        .map(|item| enrich_item(item, &rules, &plugins, classifier))
        .collect();

    if !options.include_dangerous {
        findings.retain(|f| f.entry.risk != RiskLevel::Dangerous);
    }

    findings.par_sort_unstable_by(|a, b| b.entry.size_bytes.cmp(&a.entry.size_bytes));

    let mut totals = ScanTotals::default();
    let mut by_cat: HashMap<JunkCategory, (u64, usize)> = HashMap::new();

    for f in &findings {
        totals.file_count += 1;
        totals.total_bytes += f.entry.size_bytes;
        match f.entry.risk {
            RiskLevel::Safe => totals.safe_bytes += f.entry.size_bytes,
            RiskLevel::Review => totals.review_bytes += f.entry.size_bytes,
            RiskLevel::Dangerous => totals.dangerous_bytes += f.entry.size_bytes,
        }
        let e = by_cat
            .entry(f.entry.category.clone())
            .or_insert((0, 0));
        e.0 += f.entry.size_bytes;
        e.1 += 1;
    }

    let mut large_files: Vec<EnrichedFinding> = findings
        .par_iter()
        .filter(|f| f.entry.size_bytes >= options.large_file_threshold_bytes)
        .cloned()
        .collect();
    large_files.par_sort_unstable_by(|a, b| b.entry.size_bytes.cmp(&a.entry.size_bytes));
    large_files.truncate(options.large_file_top_n);

    let mut by_category: Vec<CategoryRollup> = by_cat
        .into_iter()
        .map(|(category, (bytes, count))| CategoryRollup {
            category,
            bytes,
            count,
        })
        .collect();
    by_category.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    emit_progress(
        &mut last_emit,
        &mut on_progress,
        ScanProgressPayload {
            phase: "done".into(),
            message: "Finished".into(),
            roots_done: total,
            roots_total: total,
            percent: 100.0,
            items_so_far: findings.len() as u64,
        },
        true,
    );

    Ok(ScanResult {
        findings,
        totals,
        large_files,
        by_category,
        scan_stopped_reason: stopped_reason,
    })
}

fn empty_result(reason: Option<String>) -> ScanResult {
    ScanResult {
        findings: vec![],
        totals: ScanTotals::default(),
        large_files: vec![],
        by_category: vec![],
        scan_stopped_reason: reason,
    }
}

/// True if `path` is exactly one of `roots` or lies under one of them (path components).
pub fn path_matches_removed_root(path: &str, roots: &[String]) -> bool {
    let p = Path::new(path);
    for r in roots {
        let root = Path::new(r);
        if p == root || p.starts_with(root) {
            return true;
        }
    }
    false
}

/// Recompute [`ScanResultBrief`] after findings change (e.g. prune deleted paths from cache).
pub fn brief_from_findings(
    findings: &[EnrichedFinding],
    large_file_threshold_bytes: u64,
    large_file_top_n: usize,
    scan_stopped_reason: Option<String>,
) -> ScanResultBrief {
    let mut totals = ScanTotals::default();
    let mut by_cat: HashMap<JunkCategory, (u64, usize)> = HashMap::new();
    for f in findings {
        totals.file_count += 1;
        totals.total_bytes += f.entry.size_bytes;
        match f.entry.risk {
            RiskLevel::Safe => totals.safe_bytes += f.entry.size_bytes,
            RiskLevel::Review => totals.review_bytes += f.entry.size_bytes,
            RiskLevel::Dangerous => totals.dangerous_bytes += f.entry.size_bytes,
        }
        let e = by_cat
            .entry(f.entry.category.clone())
            .or_insert((0, 0));
        e.0 += f.entry.size_bytes;
        e.1 += 1;
    }
    let mut large_files: Vec<EnrichedFinding> = findings
        .par_iter()
        .filter(|f| f.entry.size_bytes >= large_file_threshold_bytes)
        .cloned()
        .collect();
    large_files.par_sort_unstable_by(|a, b| b.entry.size_bytes.cmp(&a.entry.size_bytes));
    large_files.truncate(large_file_top_n);
    let mut by_category: Vec<CategoryRollup> = by_cat
        .into_iter()
        .map(|(category, (bytes, count))| CategoryRollup {
            category,
            bytes,
            count,
        })
        .collect();
    by_category.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    let safe_len = findings.iter().filter(|f| f.entry.risk == RiskLevel::Safe).count();
    let review_len = findings.iter().filter(|f| f.entry.risk == RiskLevel::Review).count();
    let dangerous_len = findings
        .iter()
        .filter(|f| f.entry.risk == RiskLevel::Dangerous)
        .count();
    ScanResultBrief {
        totals,
        large_files,
        by_category,
        scan_stopped_reason,
        findings_len: findings.len(),
        safe_len,
        review_len,
        dangerous_len,
    }
}
