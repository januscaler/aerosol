//! Plugin trait + built-in plugin modules. External dylib plugins can be added later behind a feature.

mod registry;
pub mod builtins;

pub use registry::PluginRegistry;

use crate::types::{JunkCategory, RiskLevel};
use std::path::Path;

/// Shared context for classification (DRY across rules + plugins + AI).
#[derive(Debug, Clone)]
pub struct ClassifyContext<'a> {
    pub path: &'a Path,
    pub size_bytes: u64,
    pub is_dir: bool,
}

#[derive(Debug, Clone)]
pub struct PluginClassification {
    pub risk: RiskLevel,
    pub category: JunkCategory,
    pub rule_label: String,
}

/// Compile-time extensible disk plugin.
pub trait DiskPlugin: Send + Sync {
    fn id(&self) -> &'static str;
    fn name(&self) -> &'static str;
    fn description(&self) -> &'static str;
    /// Optional override when this plugin recognizes the path (higher priority than generic rules in registry).
    fn classify(&self, ctx: &ClassifyContext) -> Option<PluginClassification>;
}
