import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatBytes } from "./format";
import {
  loadRecoveryPrefs,
  patchRecoveryPrefs,
  RECOVERY_SETTINGS_CHANGED,
} from "./persistedSettings";
import type {
  RecoveryHit,
  RecoveryProgress,
  RecoveryScanMode,
  RecoveryScanOutcome,
  RecoveryVolumeInfo,
} from "./types";

const SIG_TYPES = ["png", "jpeg", "zip", "pdf", "mp4", "sqlite", "json"] as const;
const HITS_PAGE = 80;

function sectionHeading(text: string) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
      {text}
    </h2>
  );
}

/** Inline preview only for real files — carved hits point at a container, not a standalone media file. */
function canPreviewMedia(h: RecoveryHit): boolean {
  return h.kind !== "carved" && (h.category === "images" || h.category === "videos");
}

export function RecoveryView() {
  const [volumes, setVolumes] = useState<RecoveryVolumeInfo[] | null>(null);
  const [sourcePath, setSourcePath] = useState("");
  const [mode, setMode] = useState<RecoveryScanMode>(() => loadRecoveryPrefs().default_mode);
  const [maxFiles, setMaxFiles] = useState(() => loadRecoveryPrefs().max_files);
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RecoveryProgress | null>(null);
  const [summary, setSummary] = useState<RecoveryScanOutcome["summary"] | null>(null);
  const [hitsTotal, setHitsTotal] = useState(0);
  const [hitsOffset, setHitsOffset] = useState(0);
  const [rows, setRows] = useState<RecoveryHit[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [recoverBusy, setRecoverBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [recoverNote, setRecoverNote] = useState<string | null>(null);
  const [previewHit, setPreviewHit] = useState<RecoveryHit | null>(null);

  useEffect(() => {
    void (async () => {
      setLastError(null);
      try {
        const v = await invoke<RecoveryVolumeInfo[]>("recovery_list_volumes");
        setVolumes(v);
        setSourcePath((prev) => (prev.trim() === "" && v.length > 0 ? v[0]!.mountPoint : prev));
      } catch (e) {
        setLastError(String(e));
      }
    })();
  }, []);

  useEffect(() => {
    const syncFromPrefs = () => {
      const p = loadRecoveryPrefs();
      setMode(p.default_mode);
      setMaxFiles(p.max_files);
    };
    syncFromPrefs();
    window.addEventListener(RECOVERY_SETTINGS_CHANGED, syncFromPrefs);
    return () => window.removeEventListener(RECOVERY_SETTINGS_CHANGED, syncFromPrefs);
  }, []);

  useEffect(() => {
    let u: UnlistenFn | undefined;
    void listen<RecoveryProgress>("recovery-progress", (e) => {
      setProgress(e.payload);
    }).then((fn) => {
      u = fn;
    });
    return () => {
      void u?.();
    };
  }, []);

  const refreshPage = useCallback(async () => {
    const len = await invoke<number>("recovery_hits_len").catch(() => 0);
    setHitsTotal(len);
    const page = await invoke<RecoveryHit[]>("recovery_hits_page", {
      offset: hitsOffset,
      limit: HITS_PAGE,
    }).catch(() => []);
    setRows(page);
  }, [hitsOffset]);

  useEffect(() => {
    if (summary && hitsTotal >= 0) {
      void refreshPage();
    }
  }, [summary, hitsOffset, hitsTotal, refreshPage]);

  const runScan = async () => {
    setLastError(null);
    setRecoverNote(null);
    setSummary(null);
    setProgress(null);
    setSelected({});
    setHitsOffset(0);
    setBusy(true);
    try {
      const typesArr = enabledTypes.size === 0 ? [] : [...enabledTypes];
      const out = await invoke<RecoveryScanOutcome>("recovery_run_scan", {
        options: {
          sourcePath: sourcePath.trim(),
          mode,
          enabledTypes: typesArr,
          maxFiles,
        },
      });
      setSummary(out.summary);
      setHitsTotal(out.summary.hitsLen);
    } catch (e) {
      setLastError(String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const cancelScan = () => {
    void invoke("recovery_cancel_scan");
  };

  const resetScanUi = () => {
    setSummary(null);
    setHitsTotal(0);
    setHitsOffset(0);
    setRows([]);
    setSelected({});
    setRecoverNote(null);
    setProgress(null);
    setLastError(null);
  };

  const toggleType = (id: string) => {
    setEnabledTypes((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleRow = (id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  };

  const pickSourceFolder = async () => {
    if (busy) return;
    setLastError(null);
    const dir = await open({
      directory: true,
      multiple: false,
      title: "Choose folder to scan",
    });
    if (dir === null || Array.isArray(dir)) return;
    setSourcePath(dir);
  };

  const pickOutput = async () => {
    setRecoverNote(null);
    const prefs = loadRecoveryPrefs();
    const defaultPath =
      prefs.remember_output_folder && prefs.last_output_folder ? prefs.last_output_folder : undefined;
    const dir = await open({
      directory: true,
      multiple: false,
      title: "Recovery output folder",
      ...(defaultPath ? { defaultPath } : {}),
    });
    if (dir === null || Array.isArray(dir)) return;
    const ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (ids.length === 0) {
      setRecoverNote("Select at least one row.");
      return;
    }
    setRecoverBusy(true);
    try {
      const written = await invoke<string[]>("recovery_recover_files", {
        hitIds: ids,
        destinationDir: dir,
      });
      setRecoverNote(`Copied ${written.length} file(s) to ${dir}`);
      setSelected({});
      if (loadRecoveryPrefs().remember_output_folder) {
        patchRecoveryPrefs({ last_output_folder: dir });
      }
    } catch (e) {
      setLastError(String(e));
    } finally {
      setRecoverBusy(false);
    }
  };

  const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);

  const previewSrc = useMemo(() => {
    if (!previewHit || !isTauri()) return null;
    return convertFileSrc(previewHit.path);
  }, [previewHit]);

  useEffect(() => {
    if (!previewHit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewHit(null);
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [previewHit]);

  const hitRow = (h: RecoveryHit) => {
    const showPreview = canPreviewMedia(h);
    return (
      <div
        key={h.id}
        className="flex w-full cursor-pointer items-start gap-2 rounded-lg border px-2 py-2 text-left text-xs transition"
        style={{
          borderColor: selected[h.id] ? "var(--selected-row-border)" : "var(--border)",
          background: selected[h.id] ? "var(--selected-row-bg)" : "transparent",
        }}
        onClick={() => toggleRow(h.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleRow(h.id);
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={!!selected[h.id]}
      >
        <span className="mt-0.5 font-mono text-[10px] text-[var(--mono-muted)]">{h.kind}</span>
        <span className="min-w-0 flex-1 truncate font-mono" style={{ color: "var(--text)" }}>
          {h.path}
        </span>
        {showPreview ? (
          <button
            type="button"
            className="shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition hover:opacity-90"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--accent)" }}
            onClick={(e) => {
              e.stopPropagation();
              setPreviewHit(h);
            }}
          >
            Preview
          </button>
        ) : null}
        <span className="shrink-0 tabular-nums" style={{ color: "var(--muted)" }}>
          {formatBytes(h.sizeBytes)}
        </span>
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
          style={{ background: "var(--surface-muted)", color: "var(--text)" }}
        >
          {h.category}
        </span>
      </div>
    );
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      {previewHit ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgb(0 0 0 / 0.55)" }}
          role="presentation"
          onClick={() => setPreviewHit(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-xl"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            role="dialog"
            aria-modal="true"
            aria-label="Media preview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <p className="min-w-0 truncate font-mono text-[11px] sm:text-xs" style={{ color: "var(--muted)" }}>
                {previewHit.path}
              </p>
              <button
                type="button"
                className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: "var(--border)", color: "var(--text)" }}
                onClick={() => setPreviewHit(null)}
              >
                Close
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4" style={{ background: "var(--bg)" }}>
              {!isTauri() ? (
                <p className="text-center text-sm" style={{ color: "var(--muted)" }}>
                  Previews run inside the Aerosol desktop app.
                </p>
              ) : !previewSrc ? (
                <p className="text-center text-sm" style={{ color: "var(--muted)" }}>
                  Could not load this file for preview.
                </p>
              ) : previewHit.category === "videos" ? (
                <video
                  className="max-h-[min(72vh,720px)] max-w-full rounded-lg object-contain"
                  controls
                  playsInline
                  src={previewSrc}
                />
              ) : (
                <img
                  src={previewSrc}
                  alt=""
                  className="max-h-[min(72vh,720px)] max-w-full rounded-lg object-contain"
                />
              )}
            </div>
            <p className="shrink-0 border-t px-4 py-2 text-[10px]" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              Read-only preview from disk. Carved hits have no preview (they are offsets inside another file).
            </p>
          </div>
        </div>
      ) : null}

      <div
        className="shrink-0 rounded-lg border px-3 py-2 text-xs leading-relaxed sm:text-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface-muted)", color: "var(--muted)" }}
      >
        <strong style={{ color: "var(--text)" }}>Safety:</strong> read-only scan; copies go only to a folder you pick.
        SSD/TRIM limits recovery; no raw MFT/APFS yet — scans a directory tree you choose.
      </div>

      {lastError ? (
        <div
          className="shrink-0 rounded-xl border p-3 text-sm"
          style={{
            borderColor: "var(--danger-border)",
            background: "var(--danger-bg)",
            color: "var(--danger-text)",
          }}
          role="alert"
        >
          {lastError}
        </div>
      ) : null}

      <div className="results-layout min-h-0 flex-1">
        {/* Overview — mirrors cleanup “Overview” */}
        <div className="results-area-overview">
          {summary ? (
            <>
              {sectionHeading("Overview")}
              <div
                className="mt-1.5 rounded-xl border p-2.5 shadow-sm sm:p-3"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="min-w-0 text-center">
                    <p
                      className="text-[9px] font-medium uppercase tracking-wide sm:text-[10px]"
                      style={{ color: "var(--muted)" }}
                    >
                      Hits
                    </p>
                    <p
                      className="truncate text-lg font-semibold tabular-nums sm:text-2xl"
                      style={{ color: "var(--text)" }}
                    >
                      {summary.hitsLen.toLocaleString()}
                    </p>
                    <p className="text-[10px] sm:text-[11px]" style={{ color: "var(--muted)" }}>
                      recoverable rows
                    </p>
                  </div>
                  <div
                    className="min-w-0 rounded-lg px-2 py-1.5 text-center sm:rounded-xl sm:px-3 sm:py-2"
                    style={{ background: "var(--risk-safe-bg)" }}
                  >
                    <p
                      className="text-[9px] font-medium sm:text-[10px]"
                      style={{ color: "var(--risk-safe-text)" }}
                    >
                      Files scanned
                    </p>
                    <p
                      className="truncate text-sm font-semibold tabular-nums sm:text-base"
                      style={{ color: "var(--risk-safe-text)" }}
                    >
                      {summary.filesScanned.toLocaleString()}
                    </p>
                    <p className="text-[9px] opacity-90 sm:text-[10px]" style={{ color: "var(--risk-safe-text)" }}>
                      walked
                    </p>
                  </div>
                  <div
                    className="min-w-0 rounded-lg px-2 py-1.5 text-center sm:rounded-xl sm:px-3 sm:py-2"
                    style={{ background: "var(--risk-review-bg)" }}
                  >
                    <p
                      className="text-[9px] font-medium sm:text-[10px]"
                      style={{ color: "var(--risk-review-text)" }}
                    >
                      Duration
                    </p>
                    <p
                      className="truncate text-sm font-semibold tabular-nums sm:text-base"
                      style={{ color: "var(--risk-review-text)" }}
                    >
                      {(summary.durationMs / 1000).toFixed(1)}s
                    </p>
                    <p className="text-[9px] opacity-90 sm:text-[10px]" style={{ color: "var(--risk-review-text)" }}>
                      wall time
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={resetScanUi}
                className="mt-2 w-full rounded-full border px-3 py-1.5 text-xs font-medium sm:w-auto sm:self-start"
                style={{ borderColor: "var(--border)", color: "var(--text)" }}
              >
                New scan
              </button>
            </>
          ) : (
            <>
              {sectionHeading("Source")}
              <div
                className="mt-1.5 rounded-xl border p-3 shadow-sm sm:p-4"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <label className="block min-w-0">
                  <span className="text-xs font-medium" style={{ color: "var(--text)" }}>
                    Path to scan
                  </span>
                  <div className="mt-1 flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--surface-muted)",
                        color: "var(--text)",
                      }}
                      value={sourcePath}
                      onChange={(e) => setSourcePath(e.target.value)}
                      placeholder="/ or C:\ or folder"
                      aria-label="Path to scan"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void pickSourceFolder()}
                      className="shrink-0 rounded-xl border px-4 py-2 text-sm font-medium transition hover:opacity-90 disabled:opacity-40"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--surface)",
                        color: "var(--text)",
                      }}
                    >
                      Browse…
                    </button>
                  </div>
                </label>
                <p className="mt-2 text-[10px] sm:text-xs" style={{ color: "var(--muted)" }}>
                  Quick volume shortcuts:
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {volumes?.map((v) => (
                    <button
                      key={v.mountPoint}
                      type="button"
                      className="rounded-full border px-2.5 py-1 text-[10px] font-medium sm:px-3 sm:text-xs"
                      style={{ borderColor: "var(--border)", color: "var(--text)" }}
                      onClick={() => setSourcePath(v.mountPoint)}
                      title={`${v.fileSystem} · ${formatBytes(v.availableBytes)} free`}
                    >
                      {v.mountPoint || v.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Side column — mirrors cleanup “Clean up” */}
        <div className="results-area-cleanup">
          {summary ? (
            <>
              {sectionHeading("Recover")}
              <div
                className="flex min-h-0 flex-1 flex-col rounded-xl border p-3 shadow-sm sm:p-4"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <p className="text-xs leading-snug sm:text-sm" style={{ color: "var(--muted)" }}>
                  {selectedCount === 0
                    ? "Nothing selected — pick rows in the list."
                    : `${selectedCount.toLocaleString()} file(s) will be copied.`}
                </p>
                <button
                  type="button"
                  disabled={recoverBusy || selectedCount === 0}
                  onClick={() => void pickOutput()}
                  className="mt-3 w-full rounded-full px-4 py-2.5 text-sm font-semibold text-[var(--btn-primary-text)] transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-40 lg:w-auto lg:self-end"
                  style={{ background: "var(--accent)" }}
                >
                  {recoverBusy ? "Copying…" : "Recover to folder…"}
                </button>
                {recoverNote ? (
                  <p
                    className="mt-2 border-t pt-2 text-xs leading-snug sm:text-sm"
                    style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                  >
                    {recoverNote}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <>
              {sectionHeading("Scan")}
              <div
                className="flex min-h-0 flex-1 flex-col rounded-xl border p-3 shadow-sm sm:p-4"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <div
                  className="flex flex-wrap gap-1.5 rounded-xl p-1 sm:gap-2"
                  style={{ background: "var(--tab-bg)" }}
                >
                  {(
                    [
                      ["quick", "Quick"],
                      ["deep", "Deep carve"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMode(id)}
                      className="rounded-full px-2.5 py-1.5 text-left text-xs font-medium transition sm:px-3 sm:text-sm"
                      style={{
                        background: mode === id ? "var(--tab-active)" : "transparent",
                        color: mode === id ? "var(--text)" : "var(--muted)",
                        boxShadow: mode === id ? "var(--shadow)" : "none",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-snug sm:text-xs" style={{ color: "var(--muted)" }}>
                  Leave all types unchecked for every signature. Deep scans the first 16 MiB per file for embedded
                  headers.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SIG_TYPES.map((t) => (
                    <label
                      key={t}
                      className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] sm:px-2.5 sm:text-xs"
                      style={{ borderColor: "var(--border)", color: "var(--text)" }}
                    >
                      <input type="checkbox" checked={enabledTypes.has(t)} onChange={() => toggleType(t)} />
                      {t}
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                  <button
                    type="button"
                    disabled={busy || !sourcePath.trim()}
                    onClick={() => void runScan()}
                    className="rounded-full px-5 py-2.5 text-sm font-semibold text-[var(--btn-primary-text)] disabled:opacity-40"
                    style={{ background: "var(--accent)" }}
                  >
                    {busy ? "Scanning…" : "Run scan"}
                  </button>
                  {busy ? (
                    <button
                      type="button"
                      onClick={cancelScan}
                      className="rounded-full border px-4 py-2 text-sm font-medium"
                      style={{ borderColor: "var(--border)", color: "var(--text)" }}
                    >
                      Stop
                    </button>
                  ) : null}
                </div>
                {busy && progress ? (
                  <p className="mt-2 truncate font-mono text-[10px] sm:text-xs" style={{ color: "var(--muted)" }}>
                    {progress.filesScanned.toLocaleString()} files · {progress.hitsFound} hits — {progress.message}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>

        {/* Main list — mirrors cleanup “Browse & select” */}
        <div className="results-area-browse">
          <div className="shrink-0 space-y-1.5">
            {sectionHeading("Browse & select")}
            <p className="text-[11px] leading-snug sm:text-xs lg:hidden" style={{ color: "var(--muted)" }}>
              List and recovery actions — on large screens the recover panel stays on the right.
            </p>
            <p className="hidden text-xs leading-snug lg:block" style={{ color: "var(--muted)" }}>
              Only this list scrolls. Paginate with Prev / Next.
            </p>
            {summary ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] sm:text-xs" style={{ color: "var(--muted)" }}>
                  {hitsTotal === 0
                    ? "No rows"
                    : `${hitsOffset + 1}–${Math.min(hitsOffset + rows.length, hitsTotal)} of ${hitsTotal}`}
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={hitsOffset === 0}
                    className="rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-40 sm:px-3 sm:text-sm"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                    onClick={() => setHitsOffset((o) => Math.max(0, o - HITS_PAGE))}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={hitsOffset + HITS_PAGE >= hitsTotal}
                    className="rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-40 sm:px-3 sm:text-sm"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                    onClick={() => setHitsOffset((o) => o + HITS_PAGE)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div
            className="mt-1.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border sm:mt-2"
            style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
          >
            {summary ? (
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5 pr-1 sm:space-y-2 sm:p-2">
                {rows.map((h) => hitRow(h))}
              </div>
            ) : (
              <div
                className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm"
                style={{ color: "var(--muted)" }}
              >
                Run a scan to see recoverable files here.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
