//! Helpers for presenting scan data (keeps UI/CLI thin and DRY).

use crate::types::{EnrichedFinding, JunkCategory, RiskLevel, ScanResult};

pub fn filter_by_risk(result: &ScanResult, risk: RiskLevel) -> Vec<EnrichedFinding> {
    result
        .findings
        .iter()
        .filter(|f| f.entry.risk == risk)
        .cloned()
        .collect()
}

pub fn filter_by_category(result: &ScanResult, cat: &JunkCategory) -> Vec<EnrichedFinding> {
    result
        .findings
        .iter()
        .filter(|f| &f.entry.category == cat)
        .cloned()
        .collect()
}

pub fn format_bytes(n: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    if n >= GB {
        format!("{:.2} GB", n as f64 / GB as f64)
    } else if n >= MB {
        format!("{:.2} MB", n as f64 / MB as f64)
    } else if n >= KB {
        format!("{:.1} KB", n as f64 / KB as f64)
    } else {
        format!("{n} B")
    }
}
