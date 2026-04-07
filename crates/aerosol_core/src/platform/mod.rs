//! OS-specific scan roots and hints (extend per platform without duplicating engine logic).

mod common;
mod recommended;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "windows")]
mod windows;

pub use common::default_scan_roots;
pub use recommended::recommended_roots;

#[cfg(target_os = "macos")]
pub use macos::extra_scan_roots;
#[cfg(target_os = "linux")]
pub use linux::extra_scan_roots;
#[cfg(target_os = "windows")]
pub use windows::extra_scan_roots;

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
pub fn extra_scan_roots() -> Vec<std::path::PathBuf> {
    Vec::new()
}
