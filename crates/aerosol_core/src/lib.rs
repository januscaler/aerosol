//! Aerosol core: scan, classify, plugin registry, and safe cleanup.

pub mod ai;
pub mod analyzer;
pub mod cleanup;
pub mod duplicates;
pub mod engine;
pub mod error;
pub mod platform;
pub mod plugin;
pub mod rules;
pub mod scanner;
pub mod types;

pub use error::{Error, Result};
pub use types::*;
