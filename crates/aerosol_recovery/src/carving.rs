//! Memory-mapped carving for deep scan (first N bytes of each file).

use crate::error::{RecoveryError, Result};
use crate::signatures::{self, FileSignature};
use memmap2::MmapOptions;
use std::fs::File;
use std::path::Path;

const DEEP_SCAN_CAP: u64 = 16 * 1024 * 1024;

/// Map up to `DEEP_SCAN_CAP` bytes and return embedded signature offsets.
pub fn carve_file_head(path: &Path, sigs: &[FileSignature]) -> Result<Vec<(usize, FileSignature)>> {
    let file = File::open(path)?;
    let len = file.metadata()?.len();
    if len == 0 {
        return Ok(Vec::new());
    }
    let map_len = (len.min(DEEP_SCAN_CAP)) as usize;
    let mmap = unsafe {
        MmapOptions::new()
            .len(map_len)
            .map(&file)
            .map_err(|e| RecoveryError::Msg(format!("mmap: {e}")))?
    };
    Ok(signatures::carve_offsets(&mmap, sigs))
}
