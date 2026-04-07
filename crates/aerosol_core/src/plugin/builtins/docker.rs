use crate::plugin::{ClassifyContext, DiskPlugin, PluginClassification};
use crate::types::{JunkCategory, RiskLevel};

pub struct DockerPlugin;

impl DiskPlugin for DockerPlugin {
    fn id(&self) -> &'static str {
        "docker"
    }

    fn name(&self) -> &'static str {
        "Docker"
    }

    fn description(&self) -> &'static str {
        "Docker Desktop disk images and layer cache locations"
    }

    fn classify(&self, ctx: &ClassifyContext) -> Option<PluginClassification> {
        let s = ctx.path.to_string_lossy().replace('\\', "/");
        if s.contains("/Docker.raw") || s.contains("/com.docker.docker") {
            return Some(PluginClassification {
                risk: RiskLevel::Review,
                category: JunkCategory::Container,
                rule_label: "Docker VM / image data".into(),
            });
        }
        if s.contains("/.docker/") && (s.contains("buildkit") || s.contains("overlay2")) {
            return Some(PluginClassification {
                risk: RiskLevel::Review,
                category: JunkCategory::Container,
                rule_label: "Docker build cache".into(),
            });
        }
        None
    }
}
