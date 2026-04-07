//! File recovery toolkit for Aerosol: **read-only** directory scans, signature carving,
//! volume listing, and safe copy-out recovery.
//!
//! ## Scope (current)
//! - Enumerate mounted volumes via `sysinfo` (no raw block I/O).
//! - **Quick scan**: walk a directory tree, classify by extension + magic prefix.
//! - **Deep scan**: additionally carve known signatures in the first 16 MiB of each file.
//! - **Recover**: copy selected original files to an output folder (never overwrite source).
//!
//! ## Not yet implemented (roadmap)
//! - Raw disk / partition read, NTFS MFT, ext4 inode walks, APFS catalog traversal.
//! - Full file carving with size heuristics and fragmented reassembly.
//! - SSD / TRIM detection beyond UI warnings.

pub mod carving;
pub mod disk;
pub mod error;
pub mod orchestrator;
pub mod reconstruct;
pub mod recover;
pub mod scanner;
pub mod signatures;
pub mod types;

pub use error::{RecoveryError, Result};
pub use types::*;
