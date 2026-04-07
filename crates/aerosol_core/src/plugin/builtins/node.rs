use crate::plugin::{ClassifyContext, DiskPlugin, PluginClassification};
use crate::types::{JunkCategory, RiskLevel};

pub struct NodePlugin;

impl DiskPlugin for NodePlugin {
    fn id(&self) -> &'static str {
        "node"
    }

    fn name(&self) -> &'static str {
        "Node.js"
    }

    fn description(&self) -> &'static str {
        "npm/yarn/pnpm caches and node_modules hints"
    }

    fn classify(&self, ctx: &ClassifyContext) -> Option<PluginClassification> {
        let s = ctx.path.to_string_lossy().replace('\\', "/");
        if s.contains("/.npm/_cacache") {
            return Some(PluginClassification {
                risk: RiskLevel::Safe,
                category: JunkCategory::PackageManager,
                rule_label: "npm cache (cacache)".into(),
            });
        }
        if s.contains("/node_modules/") && ctx.is_dir {
            return Some(PluginClassification {
                risk: RiskLevel::Review,
                category: JunkCategory::BuildArtifact,
                rule_label: "node_modules directory".into(),
            });
        }
        None
    }
}
