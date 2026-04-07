use crate::plugin::{ClassifyContext, DiskPlugin, PluginClassification};
use crate::types::{JunkCategory, RiskLevel};

pub struct AndroidPlugin;

impl DiskPlugin for AndroidPlugin {
    fn id(&self) -> &'static str {
        "android"
    }

    fn name(&self) -> &'static str {
        "Android / Gradle"
    }

    fn description(&self) -> &'static str {
        "Gradle caches and Android build outputs"
    }

    fn classify(&self, ctx: &ClassifyContext) -> Option<PluginClassification> {
        let s = ctx.path.to_string_lossy().replace('\\', "/");
        if s.contains("/.gradle/caches") {
            return Some(PluginClassification {
                risk: RiskLevel::Safe,
                category: JunkCategory::DevCache,
                rule_label: "Gradle dependency cache".into(),
            });
        }
        if s.contains("/.android/cache") {
            return Some(PluginClassification {
                risk: RiskLevel::Safe,
                category: JunkCategory::DevCache,
                rule_label: "Android SDK cache".into(),
            });
        }
        if s.ends_with("/build/intermediates") || s.contains("/build/tmp") {
            return Some(PluginClassification {
                risk: RiskLevel::Review,
                category: JunkCategory::BuildArtifact,
                rule_label: "Android/Gradle build scratch".into(),
            });
        }
        None
    }
}
