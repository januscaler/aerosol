use super::{ClassifyContext, DiskPlugin, PluginClassification};
use crate::plugin::builtins;
use std::sync::Arc;

/// Holds all registered plugins. Add new builtins in one place.
pub struct PluginRegistry {
    plugins: Vec<Arc<dyn DiskPlugin>>,
}

impl Default for PluginRegistry {
    fn default() -> Self {
        Self::with_builtins()
    }
}

impl PluginRegistry {
    pub fn with_builtins() -> Self {
        let plugins: Vec<Arc<dyn DiskPlugin>> = vec![
            Arc::new(builtins::NodePlugin),
            Arc::new(builtins::DockerPlugin),
            Arc::new(builtins::AndroidPlugin),
            Arc::new(builtins::GitPlugin),
        ];
        Self { plugins }
    }

    pub fn register(&mut self, p: Arc<dyn DiskPlugin>) {
        self.plugins.push(p);
    }

    pub fn classify(&self, ctx: &ClassifyContext) -> Option<PluginClassification> {
        for p in &self.plugins {
            if let Some(c) = p.classify(ctx) {
                return Some(c);
            }
        }
        None
    }

    pub fn plugin_ids(&self) -> Vec<&'static str> {
        self.plugins.iter().map(|p| p.id()).collect()
    }
}
