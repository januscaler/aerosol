use crate::types::{AiSuggestion, RiskLevel};
use chrono::{Duration, Utc};
use std::path::Path;

/// Tiny, fast classifier: softmax-style normalization over three logits (safe / review / dangerous).
/// No network, no GPU — suitable as default “AI” layer and baseline for future model plugins.
#[derive(Clone, Copy)]
pub struct HeuristicClassifier {
    /// Bytes above this increase “heavy file” score toward 1.0.
    pub heavy_ref_bytes: u64,
}

impl Default for HeuristicClassifier {
    fn default() -> Self {
        Self {
            heavy_ref_bytes: 500 * 1024 * 1024,
        }
    }
}

impl HeuristicClassifier {
    pub fn suggest(
        &self,
        path: &Path,
        size_bytes: u64,
        is_dir: bool,
        rule_risk: RiskLevel,
    ) -> AiSuggestion {
        let path_s = path.to_string_lossy().replace('\\', "/").to_lowercase();

        let heavy_score = (size_bytes as f64 / self.heavy_ref_bytes as f64).min(1.0);

        // Priors from rule engine (trust but soften with path signals).
        let (mut safe_l, mut review_l, mut danger_l) = match rule_risk {
            RiskLevel::Safe => (2.2_f64, 0.2, -0.5),
            RiskLevel::Review => (0.4, 2.0, 0.3),
            RiskLevel::Dangerous => (-1.0, 0.8, 2.5),
        };

        // Path token nudges
        if path_s.contains("/documents/") || path_s.contains("/desktop/") {
            danger_l += 2.0;
        }
        if path_s.contains(".ssh") {
            danger_l += 2.5;
        }
        if path_s.contains("node_modules")
            || path_s.contains("/target/")
            || path_s.contains("/build/")
        {
            review_l += 0.8;
            if heavy_score > 0.4 {
                review_l += 0.5;
            }
        }
        if path_s.contains("/library/developer/xcode")
            || path_s.contains("/.npm/")
            || path_s.contains("/.cache/")
            || path_s.contains("/.gradle/caches")
        {
            safe_l += 0.9;
        }
        if path_s.contains("/downloads/") && size_bytes > 100 * 1024 * 1024 {
            review_l += 0.6;
        }

        // Recency: old caches feel safer to suggest cleaning
        if let Ok(meta) = path.metadata() {
            if let Ok(ft) = meta.modified() {
                let ft_utc: chrono::DateTime<Utc> = chrono::DateTime::<Utc>::from(ft);
                let age = Utc::now().signed_duration_since(ft_utc);
                if age > Duration::days(90) && matches!(rule_risk, RiskLevel::Safe) {
                    safe_l += 0.25;
                }
                if age < Duration::days(7) && matches!(rule_risk, RiskLevel::Review) {
                    review_l += 0.35;
                }
            }
        }

        if is_dir && size_bytes > 200 * 1024 * 1024 {
            review_l += 0.2;
        }

        let (p_safe, p_review, p_danger) = softmax3(safe_l, review_l, danger_l);
        let (suggested_risk, confidence) = argmax3(p_safe, p_review, p_danger);

        let rationale = build_rationale(
            &path_s,
            size_bytes,
            is_dir,
            heavy_score,
            suggested_risk,
            p_safe,
            p_review,
            p_danger,
        );

        AiSuggestion {
            confidence,
            suggested_risk,
            rationale,
            heavy_file_score: heavy_score,
        }
    }
}

fn softmax3(a: f64, b: f64, c: f64) -> (f64, f64, f64) {
    let ma = a.max(b).max(c);
    let ea = (a - ma).exp();
    let eb = (b - ma).exp();
    let ec = (c - ma).exp();
    let sum = ea + eb + ec;
    (ea / sum, eb / sum, ec / sum)
}

fn argmax3(p_safe: f64, p_review: f64, p_danger: f64) -> (RiskLevel, f64) {
    if p_safe >= p_review && p_safe >= p_danger {
        (RiskLevel::Safe, p_safe)
    } else if p_review >= p_danger {
        (RiskLevel::Review, p_review)
    } else {
        (RiskLevel::Dangerous, p_danger)
    }
}

fn build_rationale(
    path_s: &str,
    size_bytes: u64,
    is_dir: bool,
    heavy: f64,
    verdict: RiskLevel,
    p_safe: f64,
    p_review: f64,
    p_danger: f64,
) -> String {
    let kind = if is_dir { "folder" } else { "file" };
    let mb = size_bytes / (1024 * 1024);
    let mut parts = vec![format!(
        "Scored this {kind} at ~{mb} MiB; model spread safe {:.0}% / review {:.0}% / dangerous {:.0}%.",
        p_safe * 100.0,
        p_review * 100.0,
        p_danger * 100.0
    )];
    if heavy > 0.5 {
        parts.push("Large on-disk footprint — good candidate to review if it is a cache or build output.".into());
    }
    match verdict {
        RiskLevel::Safe => parts.push("Recommendation: generally safe to remove if you do not need offline caches.".into()),
        RiskLevel::Review => parts.push("Recommendation: confirm with the owning project/tool before deleting.".into()),
        RiskLevel::Dangerous => parts.push("Recommendation: treat as user data; do not bulk-delete.".into()),
    }
    if path_s.contains("node_modules") {
        parts.push("node_modules can be recreated with your package manager; keep if you need offline installs.".into());
    }
    parts.join(" ")
}
