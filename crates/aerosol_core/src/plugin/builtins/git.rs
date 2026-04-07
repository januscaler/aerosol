use crate::plugin::{ClassifyContext, DiskPlugin, PluginClassification};
use crate::types::{JunkCategory, RiskLevel};

pub struct GitPlugin;

impl DiskPlugin for GitPlugin {
    fn id(&self) -> &'static str {
        "git"
    }

    fn name(&self) -> &'static str {
        "Git"
    }

    fn description(&self) -> &'static str {
        "Large .git directories and packfiles"
    }

    fn classify(&self, ctx: &ClassifyContext) -> Option<PluginClassification> {
        let s = ctx.path.to_string_lossy().replace('\\', "/");
        if s.contains("/.git/objects/pack") && s.ends_with(".pack") {
            return Some(PluginClassification {
                risk: RiskLevel::Review,
                category: JunkCategory::Unknown,
                rule_label: "Git packfile (history)".into(),
            });
        }
        if s.ends_with("/.git") && ctx.is_dir && ctx.size_bytes > 200 * 1024 * 1024 {
            return Some(PluginClassification {
                risk: RiskLevel::Review,
                category: JunkCategory::Unknown,
                rule_label: "Large .git directory".into(),
            });
        }
        None
    }
}
