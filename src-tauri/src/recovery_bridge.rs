//! Tauri bridge for file recovery (read-only scans + copy-out).

use tauri::Emitter;

use aerosol_recovery::orchestrator;
use aerosol_recovery::recover;
use aerosol_recovery::types::{
    RecoveryCopyRequest, RecoveryHit, RecoveryProgress, RecoveryScanOptions, RecoveryScanSummary,
    RecoveryVolumeInfo,
};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

pub struct RecoveryCoordinator(pub Mutex<Option<Arc<AtomicBool>>>);

impl RecoveryCoordinator {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }

    pub fn prepare(&self) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        *self.0.lock().expect("recovery lock") = Some(flag.clone());
        flag
    }

    pub fn cancel_current(&self) {
        if let Some(f) = self.0.lock().expect("recovery lock").as_ref() {
            f.store(true, Ordering::Relaxed);
        }
    }

    pub fn clear(&self) {
        *self.0.lock().expect("recovery lock") = None;
    }
}

pub struct RecoveryHitsCache(pub Mutex<Option<Vec<RecoveryHit>>>);

impl RecoveryHitsCache {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }

    pub fn replace(&self, hits: Vec<RecoveryHit>) {
        *self.0.lock().expect("recovery hits") = Some(hits);
    }

    pub fn clear(&self) {
        *self.0.lock().expect("recovery hits") = None;
    }

    pub fn page(&self, offset: usize, limit: usize) -> Result<Vec<RecoveryHit>, String> {
        let g = self.0.lock().map_err(|e| e.to_string())?;
        let Some(h) = g.as_ref() else {
            return Err("No recovery scan in memory. Run a scan first.".into());
        };
        let limit = limit.clamp(1, 500);
        if offset >= h.len() {
            return Ok(Vec::new());
        }
        let end = (offset + limit).min(h.len());
        Ok(h[offset..end].to_vec())
    }

    pub fn len(&self) -> Result<usize, String> {
        let g = self.0.lock().map_err(|e| e.to_string())?;
        Ok(g.as_ref().map(|v| v.len()).unwrap_or(0))
    }

    pub fn all(&self) -> Result<Vec<RecoveryHit>, String> {
        let g = self.0.lock().map_err(|e| e.to_string())?;
        g.clone()
            .ok_or_else(|| "No recovery scan in memory.".into())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryScanOutcome {
    pub summary: RecoveryScanSummary,
}

#[tauri::command]
pub fn recovery_list_volumes() -> Result<Vec<RecoveryVolumeInfo>, String> {
    orchestrator::list_volumes().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn recovery_run_scan(
    app: tauri::AppHandle,
    options: RecoveryScanOptions,
    coordinator: tauri::State<'_, RecoveryCoordinator>,
    cache: tauri::State<'_, RecoveryHitsCache>,
) -> Result<RecoveryScanOutcome, String> {
    cache.clear();
    let cancel = coordinator.prepare();
    let app_emit = app.clone();
    let res = tokio::task::spawn_blocking(move || {
        orchestrator::run_scan(options, cancel.as_ref(), move |p: RecoveryProgress| {
            let app2 = app_emit.clone();
            tauri::async_runtime::spawn(async move {
                let _ = app2.emit("recovery-progress", &p);
            });
        })
    })
    .await
    .map_err(|e| e.to_string());
    coordinator.clear();
    match res {
        Ok(Ok((hits, summary))) => {
            cache.replace(hits);
            Ok(RecoveryScanOutcome { summary })
        }
        Ok(Err(e)) => {
            cache.clear();
            Err(e.to_string())
        }
        Err(e) => {
            cache.clear();
            Err(e)
        }
    }
}

#[tauri::command]
pub fn recovery_cancel_scan(coordinator: tauri::State<'_, RecoveryCoordinator>) {
    coordinator.cancel_current();
}

#[tauri::command]
pub fn recovery_hits_page(
    offset: usize,
    limit: usize,
    cache: tauri::State<'_, RecoveryHitsCache>,
) -> Result<Vec<RecoveryHit>, String> {
    cache.page(offset, limit)
}

#[tauri::command]
pub fn recovery_hits_len(cache: tauri::State<'_, RecoveryHitsCache>) -> Result<usize, String> {
    cache.len()
}

#[tauri::command]
pub fn recovery_recover_files(
    hit_ids: Vec<String>,
    destination_dir: String,
    cache: tauri::State<'_, RecoveryHitsCache>,
) -> Result<Vec<String>, String> {
    let hits = cache.all()?;
    let req = RecoveryCopyRequest {
        hit_ids,
        destination_dir,
    };
    recover::recover_hits(&hits, &req).map_err(|e| e.to_string())
}
