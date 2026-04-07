//! Read-only volume enumeration (no raw block access in this layer).

use crate::error::Result;
use crate::types::RecoveryVolumeInfo;
use sysinfo::Disks;

/// List mounted volumes with size and filesystem name (best effort).
pub fn list_volumes() -> Result<Vec<RecoveryVolumeInfo>> {
    let disks = Disks::new_with_refreshed_list();
    let mut out = Vec::new();
    for disk in disks.list() {
        let mount = disk.mount_point().to_string_lossy().to_string();
        if mount.is_empty() {
            continue;
        }
        let fs = disk
            .file_system()
            .to_str()
            .map(|s| s.to_ascii_uppercase())
            .unwrap_or_else(|| "UNKNOWN".into());
        out.push(RecoveryVolumeInfo {
            mount_point: mount,
            name: disk.name().to_string_lossy().to_string(),
            total_bytes: disk.total_space(),
            available_bytes: disk.available_space(),
            file_system: fs,
            is_removable: disk.is_removable(),
        });
    }
    Ok(out)
}
