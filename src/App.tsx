import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_DISPLAY_NAME, APP_VERSION } from "./appMeta";
import { formatBytes } from "./format";
import { RecoveryView } from "./RecoveryView";
import {
  CLEANUP_PARALLELISM_MAX,
  clampCleanupParallelism,
  loadRecoveryPrefs,
  loadScanPatch,
  loadTheme,
  loadUiPrefs,
  mergeScanOptions,
  resolveTheme,
  saveScanPatch,
  saveTheme,
  saveUiPrefs,
  setRecoveryPrefs,
  type RecoveryPrefs,
  type ScanSettingsPatch,
  type ThemeChoice,
} from "./persistedSettings";
import type {
  CleanRequest,
  CleanResult,
  CleanupProgressPayload,
  DuplicateGroup,
  EnrichedFinding,
  ScanOptions,
  ScanProgressPayload,
  ScanResultBrief,
} from "./types";

type FilterTab = "all" | "safe" | "review";

type AppMode = "cleanup" | "recovery";

const LIST_PAGE_SIZE = 100;
const SAFE_PATHS_PAGE = 2000;

/** Drop selection for paths we attempted to delete, except those that failed (match by normalized path). */
function clearSelectionAfterCleanup(
  selected: Record<string, boolean>,
  requestedPaths: string[],
  failedPaths: string[],
): Record<string, boolean> {
  if (requestedPaths.length === 0) return selected;
  const norm = (p: string) => p.replace(/\\/g, "/");
  const failedNorm = new Set(failedPaths.map((f) => norm(f)));
  const requestedNorm = new Set(requestedPaths.map((p) => norm(p)));
  const next = { ...selected };
  for (const key of Object.keys(next)) {
    const kn = norm(key);
    if (!requestedNorm.has(kn)) continue;
    if (failedNorm.has(kn)) continue;
    delete next[key];
  }
  return next;
}

function clampPageOffset(offset: number, total: number, pageSize: number): number {
  if (total === 0) return 0;
  if (offset < total) return offset;
  return Math.max(0, Math.floor((total - 1) / pageSize) * pageSize);
}

function friendlyRisk(risk: string): string {
  switch (risk) {
    case "safe":
      return "OK to clean";
    case "review":
      return "Check first";
    case "dangerous":
      return "Skip";
    default:
      return risk;
  }
}

function shortPath(full: string): string | { name: string; hint: string } {
  const parts = full.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0) return full;
  const name = parts[parts.length - 1]!;
  if (parts.length <= 2) return full;
  const parent = parts.slice(-3, -1).join("/");
  return { name, hint: `…/${parent}/` };
}

function Row({
  f,
  selected,
  onToggle,
}: {
  f: EnrichedFinding;
  selected: boolean;
  onToggle: () => void;
}) {
  const e = f.entry;
  const sp = shortPath(e.path);
  const isStringPath = typeof sp === "string";
  let riskBg = "var(--risk-review-bg)";
  let riskFg = "var(--risk-review-text)";
  if (e.risk === "safe") {
    riskBg = "var(--risk-safe-bg)";
    riskFg = "var(--risk-safe-text)";
  } else if (e.risk === "dangerous") {
    riskBg = "var(--risk-danger-bg)";
    riskFg = "var(--risk-danger-text)";
  }

  const handleRowClick = (ev: React.MouseEvent) => {
    const el = ev.target as HTMLElement;
    if (el.closest("input, details, summary, a, button")) return;
    onToggle();
  };

  return (
    <div
      className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4 shadow-sm transition hover:opacity-95"
      style={{
        borderColor: selected ? "var(--selected-row-border)" : "var(--border)",
        background: selected ? "var(--selected-row-bg)" : "var(--surface)",
        boxShadow: "var(--shadow)",
      }}
      onClick={handleRowClick}
    >
      <input
        type="checkbox"
        aria-label={selected ? "Deselect item" : "Select item"}
        className="peer mt-1 h-[18px] w-[18px] shrink-0 cursor-pointer rounded border"
        style={{
          borderColor: "var(--border)",
          accentColor: "var(--accent)",
        }}
        checked={selected}
        onChange={(ev) => {
          ev.stopPropagation();
          onToggle();
        }}
        onClick={(ev) => ev.stopPropagation()}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ background: riskBg, color: riskFg }}
          >
            {friendlyRisk(e.risk)}
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            {isStringPath ? sp : sp.name}
          </span>
          <span className="ml-auto text-sm font-medium" style={{ color: "var(--muted)" }}>
            {formatBytes(e.size_bytes)}
          </span>
        </div>
        {!isStringPath ? (
          <p className="mt-0.5 truncate text-xs" style={{ color: "var(--muted)" }}>
            {sp.hint}
          </p>
        ) : null}
        <p
          className="mt-1 break-all font-mono text-[11px] leading-snug"
          style={{ color: "var(--mono-muted)" }}
        >
          {e.path}
        </p>
        <details className="mt-2">
          <summary
            className="cursor-pointer text-xs font-medium"
            style={{ color: "var(--accent)" }}
          >
            Why this score?
          </summary>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            {f.ai.rationale}
          </p>
        </details>
      </div>
    </div>
  );
}

function fieldClass() {
  return "w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30";
}

function scopeLabel(scope: ScanOptions["scan_scope"]): string {
  return scope === "full_home"
    ? "Entire home folder (slower, deeper)"
    : "Recommended developer caches (faster)";
}

function sectionHeading(text: string) {
  return (
    <h2
      className="text-[11px] font-semibold uppercase tracking-wider"
      style={{ color: "var(--muted)" }}
    >
      {text}
    </h2>
  );
}

function BrandLogo({ className = "", alt = "" }: { className?: string; alt?: string }) {
  return (
    <img
      src="/logo.png"
      alt={alt}
      width={200}
      height={236}
      draggable={false}
      className={`pointer-events-none select-none object-contain object-left ${className}`}
    />
  );
}

export default function App() {
  const [options, setOptions] = useState<ScanOptions | null>(null);
  const [summary, setSummary] = useState<ScanResultBrief | null>(null);
  const [listRows, setListRows] = useState<EnrichedFinding[]>([]);
  const [listOffset, setListOffset] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<FilterTab>("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [dryRun, setDryRun] = useState(true);
  const [useTrash, setUseTrash] = useState(true);
  const [cleanupParallelism, setCleanupParallelism] = useState(() => loadUiPrefs().cleanup_parallelism);
  const [cleanResult, setCleanResult] = useState<CleanResult | null>(null);
  const [dupes, setDupes] = useState<DuplicateGroup[] | null>(null);
  const [dupBusy, setDupBusy] = useState(false);
  const [progress, setProgress] = useState<ScanProgressPayload | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<
    "preferences" | "recovery" | "help" | "about"
  >("preferences");
  const [bulkSafeBusy, setBulkSafeBusy] = useState(false);
  const [cleanBusy, setCleanBusy] = useState(false);
  const [cleanProgress, setCleanProgress] = useState<CleanupProgressPayload | null>(null);
  /** Ignore progress events that arrive after the scan command has finished (ordering glitches). */
  const scanBusyRef = useRef(false);

  const [appMode, setAppMode] = useState<AppMode>("cleanup");
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => loadTheme());
  const [draftPatch, setDraftPatch] = useState<ScanSettingsPatch>(() => loadScanPatch());
  const [extraRootsText, setExtraRootsText] = useState("");
  const [draftUi, setDraftUi] = useState(() => loadUiPrefs());
  const [draftRecovery, setDraftRecovery] = useState<RecoveryPrefs>(() => loadRecoveryPrefs());

  useEffect(() => {
    if (!settingsOpen || !options) return;
    setDraftPatch({
      scan_scope: options.scan_scope,
      time_budget_secs: options.time_budget_secs,
      max_depth: options.max_depth ?? undefined,
      max_entries_per_root: options.max_entries_per_root,
      large_file_threshold_bytes: options.large_file_threshold_bytes,
      large_file_top_n: options.large_file_top_n,
      include_dangerous: options.include_dangerous,
      extra_roots: options.extra_roots,
      skip_substrings: options.skip_substrings,
      respect_gitignore: options.respect_gitignore,
    });
    setExtraRootsText(options.extra_roots.join("\n"));
    setThemeChoice(loadTheme());
    setDraftUi(loadUiPrefs());
    setDraftRecovery(loadRecoveryPrefs());
  }, [settingsOpen, options]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolveTheme(themeChoice));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (themeChoice === "system") {
        document.documentElement.setAttribute("data-theme", resolveTheme("system"));
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [themeChoice]);

  useEffect(() => {
    void (async () => {
      const base = await invoke<ScanOptions>("default_scan_options");
      const merged = mergeScanOptions(base, loadScanPatch());
      setOptions(merged);
      const ui = loadUiPrefs();
      setDryRun(ui.default_dry_run);
      setUseTrash(ui.default_use_trash);
      setCleanupParallelism(ui.cleanup_parallelism);
    })();
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    void listen<ScanProgressPayload>("scan-progress", (event) => {
      const p = event.payload;
      if (p.phase === "done") {
        setProgress(null);
        return;
      }
      if (!scanBusyRef.current) return;
      setProgress(p);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      void unlisten?.();
    };
  }, []);

  const runScan = useCallback(async () => {
    if (!options) return;
    setError(null);
    setCleanResult(null);
    setDupes(null);
    setProgress(null);
    setSummary(null);
    scanBusyRef.current = true;
    setBusy(true);
    setSelected({});
    setListOffset(0);
    setListRows([]);
    try {
      const brief = await invoke<ScanResultBrief>("scan_disk", { options });
      setSummary(brief);
    } catch (e) {
      setSummary(null);
      setListRows([]);
      setError(String(e));
    } finally {
      scanBusyRef.current = false;
      setBusy(false);
      setProgress(null);
    }
  }, [options]);

  const cancelScan = useCallback(async () => {
    await invoke("cancel_scan").catch(() => {});
  }, []);

  const totalForFilter = useMemo(() => {
    if (!summary) return 0;
    if (tab === "all") return summary.findings_len;
    if (tab === "safe") return summary.safe_len;
    return summary.review_len;
  }, [summary, tab]);

  useEffect(() => {
    if (!summary || summary.findings_len === 0) {
      setListRows([]);
      return;
    }
    if (totalForFilter === 0) {
      setListRows([]);
      return;
    }
    const filter = tab === "all" ? "all" : tab;
    let cancelled = false;
    setListLoading(true);
    void invoke<EnrichedFinding[]>("get_scan_findings_page", {
      filter,
      offset: listOffset,
      limit: LIST_PAGE_SIZE,
    })
      .then((rows) => {
        if (!cancelled) setListRows(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [summary, tab, listOffset, totalForFilter]);

  const selectTab = (id: FilterTab) => {
    setListOffset(0);
    setTab(id);
  };

  const toggle = (path: string) => {
    setSelected((s) => ({ ...s, [path]: !s[path] }));
  };

  const selectedPaths = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  const selectVisiblePage = () => {
    setSelected((s) => {
      const n = { ...s };
      for (const f of listRows) n[f.entry.path] = true;
      return n;
    });
  };

  const selectAllSafePaths = async () => {
    if (!summary || summary.safe_len === 0) return;
    setError(null);
    setBulkSafeBusy(true);
    try {
      const next = { ...selected };
      let offset = 0;
      for (;;) {
        const paths = await invoke<string[]>("get_scan_paths_page", {
          filter: "safe",
          offset,
          limit: SAFE_PATHS_PAGE,
        });
        if (paths.length === 0) break;
        for (const p of paths) next[p] = true;
        offset += paths.length;
        if (paths.length < SAFE_PATHS_PAGE) break;
      }
      setSelected(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setBulkSafeBusy(false);
    }
  };

  const runClean = async () => {
    if (selectedPaths.length === 0 || cleanBusy) return;
    const pathsRequested = [...selectedPaths];
    setError(null);
    setCleanProgress(null);
    setCleanBusy(true);
    let unlisten: UnlistenFn | undefined;
    try {
      unlisten = await listen<CleanupProgressPayload>("cleanup-progress", (event) => {
        setCleanProgress(event.payload);
      });
      const res = await invoke<CleanResult>("run_cleanup", {
        request: {
          paths: pathsRequested,
          dry_run: dryRun,
          use_trash: useTrash,
          cleanup_parallelism: cleanupParallelism,
        } satisfies CleanRequest,
      });
      setCleanResult(res);
      if (!dryRun) {
        setSelected((s) => clearSelectionAfterCleanup(s, pathsRequested, res.failed));
        if (res.removed_paths.length > 0 && options) {
          try {
            const brief = await invoke<ScanResultBrief>("prune_scan_after_cleanup", {
              args: {
                removedPaths: res.removed_paths,
                largeFileThresholdBytes: options.large_file_threshold_bytes,
                largeFileTopN: options.large_file_top_n,
                scanStoppedReason: summary?.scan_stopped_reason ?? null,
              },
            });
            setSummary(brief);
            const tf =
              tab === "all"
                ? brief.findings_len
                : tab === "safe"
                  ? brief.safe_len
                  : brief.review_len;
            setListOffset((off) => clampPageOffset(off, tf, LIST_PAGE_SIZE));
          } catch (pruneErr) {
            setError(String(pruneErr));
          }
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      void unlisten?.();
      setCleanBusy(false);
      setCleanProgress(null);
    }
  };

  const runDupes = async () => {
    if (!summary) return;
    const paths = summary.large_files.filter((f) => !f.entry.is_dir).map((f) => f.entry.path);
    if (paths.length < 2) {
      setError("Need at least two large files to compare.");
      return;
    }
    setDupBusy(true);
    setError(null);
    try {
      const min = options?.large_file_threshold_bytes ?? 50 * 1024 * 1024;
      const groups = await invoke<DuplicateGroup[]>("run_duplicate_check", {
        paths,
        min_bytes: min,
      });
      setDupes(groups);
    } catch (e) {
      setError(String(e));
    } finally {
      setDupBusy(false);
    }
  };

  const applyRecoverySettings = () => {
    setRecoveryPrefs(draftRecovery);
    setSettingsOpen(false);
  };

  const applySettings = async () => {
    const roots = extraRootsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const patch: ScanSettingsPatch = {
      scan_scope: draftPatch.scan_scope ?? "recommended",
      time_budget_secs: draftPatch.time_budget_secs ?? 40,
      max_depth: draftPatch.max_depth ?? 6,
      max_entries_per_root: draftPatch.max_entries_per_root ?? 100_000,
      large_file_threshold_bytes: draftPatch.large_file_threshold_bytes ?? 50 * 1024 * 1024,
      large_file_top_n: draftPatch.large_file_top_n ?? 100,
      include_dangerous: draftPatch.include_dangerous ?? false,
      extra_roots: roots,
      skip_substrings: draftPatch.skip_substrings ?? [],
      respect_gitignore: draftPatch.respect_gitignore ?? false,
    };
    saveScanPatch(patch);
    saveTheme(themeChoice);
    const uiNext = {
      ...draftUi,
      cleanup_parallelism: clampCleanupParallelism(draftUi.cleanup_parallelism),
    };
    saveUiPrefs(uiNext);
    const base = await invoke<ScanOptions>("default_scan_options");
    setOptions(mergeScanOptions(base, patch));
    setDryRun(uiNext.default_dry_run);
    setUseTrash(uiNext.default_use_trash);
    setCleanupParallelism(uiNext.cleanup_parallelism);
    setSettingsOpen(false);
  };

  const mainReclaim = summary ? summary.totals.safe_bytes + summary.totals.review_bytes : 0;

  const canPrevPage = listOffset > 0;
  const canNextPage =
    summary !== null && totalForFilter > 0 && listOffset + LIST_PAGE_SIZE < totalForFilter;

  const inputStyle = { background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--text)" };

  const subtitle = busy
    ? "Scanning your disk — you can stop anytime."
    : summary
      ? "Review what we found, then preview or run cleanup."
      : "Reclaim space from caches and leftovers — safely.";

  const postScanLayout = Boolean(summary && !busy);
  const recoveryLayout = appMode === "recovery";

  return (
    <div
      className={`flex flex-col ${postScanLayout || recoveryLayout ? "h-full max-h-full min-h-0 overflow-hidden" : "min-h-full"}`}
      style={{ background: "var(--bg)" }}
    >
      <header
        className="shrink-0 border-b shadow-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div
          className={`mx-auto flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4 ${postScanLayout || recoveryLayout ? "max-w-7xl" : "max-w-6xl"}`}
        >
          <div className="flex min-w-0 items-start gap-3">
            <BrandLogo className="h-11 w-auto shrink-0" alt="" />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                {APP_DISPLAY_NAME}
              </h1>
              <p className="mt-0.5 text-sm leading-snug" style={{ color: "var(--muted)" }}>
                {recoveryLayout
                  ? "Scan a folder read-only, then copy matches into a destination you choose."
                  : subtitle}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <nav
              className="mr-1 flex flex-wrap gap-1 rounded-full p-1"
              style={{ background: "var(--tab-bg)" }}
              aria-label="Main mode"
            >
              {(
                [
                  ["cleanup", "Cleanup"],
                  ["recovery", "File recovery"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAppMode(id)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium transition sm:text-sm"
                  style={{
                    background: appMode === id ? "var(--tab-active)" : "transparent",
                    color: appMode === id ? "var(--text)" : "var(--muted)",
                    boxShadow: appMode === id ? "var(--shadow)" : "none",
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
            {summary && !busy && appMode === "cleanup" ? (
              <button
                type="button"
                disabled={!options}
                onClick={() => void runScan()}
                className="rounded-full border px-4 py-2 text-sm font-medium transition hover:opacity-90 disabled:opacity-40"
                style={{ borderColor: "var(--border)", background: "var(--surface-muted)", color: "var(--text)" }}
              >
                New scan
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setSettingsPanel("help");
                setSettingsOpen(true);
              }}
              className="rounded-full border px-4 py-2 text-sm font-medium transition hover:opacity-90"
              style={{ borderColor: "var(--border)", background: "var(--surface-muted)", color: "var(--text)" }}
            >
              Help
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsPanel(appMode === "recovery" ? "recovery" : "preferences");
                setSettingsOpen(true);
              }}
              className="rounded-full border px-4 py-2 text-sm font-medium shadow-sm transition hover:opacity-90"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
            >
              Settings
            </button>
          </div>
        </div>
      </header>

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ background: "rgb(0 0 0 / 0.45)" }}
          role="presentation"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-6 shadow-xl"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            role="dialog"
            aria-labelledby="settings-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center border-b pb-5" style={{ borderColor: "var(--border)" }}>
              <BrandLogo className="h-16 w-auto" alt={`${APP_DISPLAY_NAME} logo`} />
              <nav
                className="mt-4 flex w-full max-w-md flex-wrap justify-center gap-1 rounded-full p-1"
                style={{ background: "var(--tab-bg)" }}
                aria-label="Dialog sections"
              >
                {(
                  [
                    ["preferences", "Preferences"],
                    ["recovery", "File recovery"],
                    ["help", "Help"],
                    ["about", "About"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSettingsPanel(id)}
                    className="rounded-full px-3 py-2 text-sm font-medium transition sm:px-4"
                    style={{
                      background: settingsPanel === id ? "var(--tab-active)" : "transparent",
                      color: settingsPanel === id ? "var(--text)" : "var(--muted)",
                      boxShadow: settingsPanel === id ? "var(--shadow)" : "none",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>

            <h2 id="settings-dialog-title" className="mt-5 text-lg font-semibold" style={{ color: "var(--text)" }}>
              {settingsPanel === "preferences"
                ? "Preferences"
                : settingsPanel === "recovery"
                  ? "File recovery"
                  : settingsPanel === "help"
                    ? "Help"
                    : "About"}
            </h2>
            {settingsPanel === "preferences" ? (
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                Changes apply the next time you scan or clean.
              </p>
            ) : null}
            {settingsPanel === "recovery" ? (
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                Defaults for recovery scans and the output folder dialog.
              </p>
            ) : null}

            {settingsPanel === "preferences" ? (
            <div className="mt-6 space-y-5 text-sm">
              <div>
                <label className="block font-medium" style={{ color: "var(--text)" }}>
                  Appearance
                </label>
                <select
                  className={`mt-1 ${fieldClass()}`}
                  style={inputStyle}
                  value={themeChoice}
                  onChange={(e) => setThemeChoice(e.target.value as ThemeChoice)}
                >
                  <option value="system">Match system</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>

              <div>
                <label className="block font-medium" style={{ color: "var(--text)" }}>
                  Scan scope
                </label>
                <select
                  className={`mt-1 ${fieldClass()}`}
                  style={inputStyle}
                  value={draftPatch.scan_scope ?? "recommended"}
                  onChange={(e) =>
                    setDraftPatch({
                      ...draftPatch,
                      scan_scope: e.target.value as ScanOptions["scan_scope"],
                    })
                  }
                >
                  <option value="recommended">Recommended caches (fast, ~under a minute)</option>
                  <option value="full_home">Entire home folder (slow — can take many minutes)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium" style={{ color: "var(--text)" }}>
                  Time budget (seconds)
                </label>
                <input
                  type="number"
                  min={15}
                  max={600}
                  className={`mt-1 ${fieldClass()}`}
                  style={inputStyle}
                  value={draftPatch.time_budget_secs ?? 40}
                  onChange={(e) =>
                    setDraftPatch({ ...draftPatch, time_budget_secs: Number(e.target.value) })
                  }
                />
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  Scan stops and still shows partial results after this.
                </p>
              </div>

              <div>
                <label className="block font-medium" style={{ color: "var(--text)" }}>
                  Max folder depth
                </label>
                <input
                  type="number"
                  min={2}
                  max={32}
                  className={`mt-1 ${fieldClass()}`}
                  style={inputStyle}
                  value={draftPatch.max_depth ?? 6}
                  onChange={(e) =>
                    setDraftPatch({ ...draftPatch, max_depth: Number(e.target.value) })
                  }
                />
              </div>

              <div>
                <label className="block font-medium" style={{ color: "var(--text)" }}>
                  Max items per folder
                </label>
                <input
                  type="number"
                  min={5000}
                  max={500000}
                  step={5000}
                  className={`mt-1 ${fieldClass()}`}
                  style={inputStyle}
                  value={draftPatch.max_entries_per_root ?? 100000}
                  onChange={(e) =>
                    setDraftPatch({ ...draftPatch, max_entries_per_root: Number(e.target.value) })
                  }
                />
              </div>

              <div>
                <label className="block font-medium" style={{ color: "var(--text)" }}>
                  “Large file” minimum (MB)
                </label>
                <input
                  type="number"
                  min={1}
                  max={2048}
                  className={`mt-1 ${fieldClass()}`}
                  style={inputStyle}
                  value={Math.round((draftPatch.large_file_threshold_bytes ?? 52428800) / (1024 * 1024))}
                  onChange={(e) =>
                    setDraftPatch({
                      ...draftPatch,
                      large_file_threshold_bytes: Number(e.target.value) * 1024 * 1024,
                    })
                  }
                />
              </div>

              <div>
                <label className="block font-medium" style={{ color: "var(--text)" }}>
                  Top large files to keep
                </label>
                <input
                  type="number"
                  min={10}
                  max={500}
                  className={`mt-1 ${fieldClass()}`}
                  style={inputStyle}
                  value={draftPatch.large_file_top_n ?? 100}
                  onChange={(e) =>
                    setDraftPatch({ ...draftPatch, large_file_top_n: Number(e.target.value) })
                  }
                />
              </div>

              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={draftPatch.include_dangerous ?? false}
                  onChange={(e) =>
                    setDraftPatch({ ...draftPatch, include_dangerous: e.target.checked })
                  }
                />
                <span style={{ color: "var(--muted)" }}>
                  Include sensitive areas (Documents, Desktop, SSH, …) in results.
                </span>
              </label>

              <div>
                <label className="block font-medium" style={{ color: "var(--text)" }}>
                  Extra folders to scan (one path per line)
                </label>
                <textarea
                  className={`mt-1 min-h-[88px] resize-y ${fieldClass()}`}
                  style={inputStyle}
                  value={extraRootsText}
                  onChange={(e) => setExtraRootsText(e.target.value)}
                  placeholder="/path/to/project/build"
                />
              </div>

              <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <p className="font-medium" style={{ color: "var(--text)" }}>
                  Cleanup defaults
                </p>
                <label className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draftUi.default_dry_run}
                    onChange={(e) =>
                      setDraftUi({ ...draftUi, default_dry_run: e.target.checked })
                    }
                  />
                  <span style={{ color: "var(--muted)" }}>Start with “preview only” checked</span>
                </label>
                <label className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draftUi.default_use_trash}
                    onChange={(e) =>
                      setDraftUi({ ...draftUi, default_use_trash: e.target.checked })
                    }
                  />
                  <span style={{ color: "var(--muted)" }}>Prefer Move to Trash</span>
                </label>
                <div className="mt-4">
                  <label className="block font-medium" style={{ color: "var(--text)" }}>
                    Cleanup parallelism
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={CLEANUP_PARALLELISM_MAX}
                    className={`mt-1 ${fieldClass()}`}
                    style={inputStyle}
                    value={draftUi.cleanup_parallelism ?? 4}
                    onChange={(e) =>
                      setDraftUi({
                        ...draftUi,
                        cleanup_parallelism: clampCleanupParallelism(Number(e.target.value)),
                      })
                    }
                  />
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                    How many paths to delete or trash at once (1–{CLEANUP_PARALLELISM_MAX}). Recommended default is 4
                    — higher values can speed large cleanups but may stress disk, Trash, or the OS; 1 is fully
                    sequential.
                  </p>
                </div>
              </div>
            </div>
            ) : null}

            {settingsPanel === "recovery" ? (
              <div className="mt-6 space-y-5 text-sm">
                <div>
                  <label className="block font-medium" style={{ color: "var(--text)" }}>
                    Default scan mode
                  </label>
                  <select
                    className={`mt-1 ${fieldClass()}`}
                    style={inputStyle}
                    value={draftRecovery.default_mode}
                    onChange={(e) =>
                      setDraftRecovery({
                        ...draftRecovery,
                        default_mode: e.target.value as "quick" | "deep",
                      })
                    }
                  >
                    <option value="quick">Quick (metadata + magic)</option>
                    <option value="deep">Deep (carve first 16 MiB)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium" style={{ color: "var(--text)" }}>
                    Max files per scan
                  </label>
                  <input
                    type="number"
                    min={1000}
                    max={500000}
                    step={1000}
                    className={`mt-1 ${fieldClass()}`}
                    style={inputStyle}
                    value={draftRecovery.max_files}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setDraftRecovery({
                        ...draftRecovery,
                        max_files: Number.isFinite(n)
                          ? Math.min(500_000, Math.max(1000, Math.round(n)))
                          : 50_000,
                      });
                    }}
                  />
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                    Upper bound on paths visited each run (stops early if the tree is larger).
                  </p>
                </div>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={draftRecovery.remember_output_folder}
                    onChange={(e) =>
                      setDraftRecovery({
                        ...draftRecovery,
                        remember_output_folder: e.target.checked,
                      })
                    }
                  />
                  <span style={{ color: "var(--muted)" }}>
                    Remember last recovery output folder (folder dialog starts there next time).
                  </span>
                </label>
                {draftRecovery.last_output_folder ? (
                  <p className="break-all font-mono text-xs" style={{ color: "var(--mono-muted)" }}>
                    Last folder: {draftRecovery.last_output_folder}
                  </p>
                ) : null}
              </div>
            ) : null}

            {settingsPanel === "help" ? (
              <div className="mt-5 space-y-4 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                <p style={{ color: "var(--text)" }}>
                  Quick guide to cleaning safely with {APP_DISPLAY_NAME}.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    Start with <strong style={{ color: "var(--text)" }}>Recommended</strong> scope unless you
                    need a full-home pass — it keeps scans predictable.
                  </li>
                  <li>
                    Use <strong style={{ color: "var(--text)" }}>Quick wins</strong> to focus on items marked
                    usually safe; read <strong style={{ color: "var(--text)" }}>Needs review</strong> before
                    deleting anything uncertain.
                  </li>
                  <li>
                    Keep <strong style={{ color: "var(--text)" }}>Preview only</strong> on until the listed
                    paths match what you expect, then turn it off to clean.
                  </li>
                  <li>
                    <strong style={{ color: "var(--text)" }}>Move to Trash</strong> uses the system trash when
                    possible so you can recover from mistakes.
                  </li>
                  <li>
                    Large lists are paged — use <strong style={{ color: "var(--text)" }}>Select all safe</strong>{" "}
                    or row clicks to build your selection, then run preview or cleanup.
                  </li>
                  <li>
                    <strong style={{ color: "var(--text)" }}>File recovery</strong> uses read-only scans and copies
                    into a folder you choose — defaults live under Settings → File recovery.
                  </li>
                </ul>
              </div>
            ) : null}

            {settingsPanel === "about" ? (
              <div className="mt-5 flex flex-col items-center text-center">
                <BrandLogo className="h-28 w-auto" alt={`${APP_DISPLAY_NAME} logo`} />
                <p className="mt-4 text-lg font-semibold" style={{ color: "var(--text)" }}>
                  {APP_DISPLAY_NAME}
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                  Device cleanup & optimization — scan caches and reclaim space safely.
                </p>
                <p className="mt-3 font-mono text-xs" style={{ color: "var(--mono-muted)" }}>
                  Version {APP_VERSION}
                </p>
              </div>
            ) : null}

            <div className="mt-8 flex justify-end gap-2">
              {settingsPanel === "preferences" ? (
                <>
                  <button
                    type="button"
                    className="rounded-full px-4 py-2 text-sm font-medium"
                    style={{ color: "var(--muted)" }}
                    onClick={() => setSettingsOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-full px-5 py-2 text-sm font-semibold text-[var(--btn-primary-text)]"
                    style={{ background: "var(--accent)" }}
                    onClick={() => void applySettings()}
                  >
                    Save
                  </button>
                </>
              ) : settingsPanel === "recovery" ? (
                <>
                  <button
                    type="button"
                    className="rounded-full px-4 py-2 text-sm font-medium"
                    style={{ color: "var(--muted)" }}
                    onClick={() => setSettingsOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-full px-5 py-2 text-sm font-semibold text-[var(--btn-primary-text)]"
                    style={{ background: "var(--accent)" }}
                    onClick={applyRecoverySettings}
                  >
                    Save
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="rounded-full px-5 py-2 text-sm font-semibold text-[var(--btn-primary-text)]"
                  style={{ background: "var(--accent)" }}
                  onClick={() => setSettingsOpen(false)}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <main
        className={`mx-auto flex w-full flex-1 flex-col min-h-0 ${
          recoveryLayout
            ? "max-w-7xl overflow-hidden px-3 py-2 pb-3 sm:px-4 sm:py-3"
            : postScanLayout
              ? "max-w-7xl overflow-hidden px-3 py-2 pb-3 sm:px-4 sm:py-3"
              : "max-w-6xl justify-center overflow-y-auto px-5 py-10 sm:px-8 sm:py-12"
        }`}
      >
        {recoveryLayout ? <RecoveryView /> : null}
        {!recoveryLayout && error ? (
          <div
            className="mb-8 rounded-2xl border p-4 text-sm"
            style={{
              borderColor: "var(--danger-border)",
              background: "var(--danger-bg)",
              color: "var(--danger-text)",
            }}
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {!recoveryLayout && busy ? (
          <section className="mx-auto w-full max-w-xl space-y-6 lg:max-w-2xl" aria-busy="true" aria-live="polite">
            <div className="text-center">
              {sectionHeading("In progress")}
              <p className="mt-2 text-lg font-medium" style={{ color: "var(--text)" }}>
                {!progress
                  ? "Starting scan…"
                  : progress.phase === "walking"
                    ? "Walking folders"
                    : progress.phase === "analyzing"
                      ? "Analyzing findings"
                      : "Working"}
              </p>
            </div>
            <div
              className="rounded-2xl border p-5 shadow-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <p className="truncate font-mono text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                {progress?.message ?? "Connecting to scanner…"}
              </p>
              <div
                className="mt-4 h-2.5 overflow-hidden rounded-full"
                style={{ background: "var(--progress-track)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{
                    width: progress ? `${Math.min(100, Math.max(0, progress.percent))}%` : "10%",
                    background: "var(--progress-fill)",
                  }}
                />
              </div>
              <p className="mt-3 text-center text-xs" style={{ color: "var(--muted)" }}>
                {progress
                  ? `${progress.roots_done}/${progress.roots_total} locations · ${progress.items_so_far.toLocaleString()} paths scanned`
                  : "Preparing…"}
              </p>
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void cancelScan()}
                className="rounded-full border px-5 py-2.5 text-sm font-medium transition hover:opacity-90"
                style={{ borderColor: "var(--border)", background: "var(--surface-muted)", color: "var(--text)" }}
              >
                Stop scan
              </button>
            </div>
          </section>
        ) : null}

        {!recoveryLayout && !busy && !summary ? (
          <section className="grid w-full gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
            <div className="flex flex-col gap-8">
              <div className="space-y-4 text-center lg:text-left">
                {sectionHeading("Before you start")}
                <p className="text-base leading-relaxed sm:text-lg" style={{ color: "var(--muted)" }}>
                  We look for caches, build artifacts, and similar junk — not your personal files unless
                  you change scope in Settings.
                </p>
              </div>

              <div className="flex flex-col items-center gap-4 lg:items-start">
                <button
                  type="button"
                  disabled={!options}
                  onClick={() => void runScan()}
                  className="min-h-[52px] w-full max-w-sm rounded-full px-8 text-[17px] font-semibold text-[var(--btn-primary-text)] shadow-md transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-45 sm:max-w-md lg:w-auto lg:min-w-[280px]"
                  style={{ background: "var(--accent)" }}
                >
                  Start scan
                </button>
                <p className="max-w-md text-center text-sm leading-relaxed lg:text-left" style={{ color: "var(--muted)" }}>
                  Large homes can take a while; partial results appear if the time budget is reached.
                </p>
              </div>
            </div>

            <div
              className="rounded-2xl border p-6 shadow-sm sm:p-8"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              {sectionHeading("How it works")}
              <ol className="mt-5 list-decimal space-y-4 pl-5 text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
                <li style={{ color: "var(--muted)" }}>
                  <span style={{ color: "var(--text)" }}>Scan</span> — map reclaimable paths using your
                  scope and time budget.
                </li>
                <li style={{ color: "var(--muted)" }}>
                  <span style={{ color: "var(--text)" }}>Review</span> — we label items{" "}
                  <span className="font-medium" style={{ color: "var(--risk-safe-text)" }}>
                    usually safe
                  </span>{" "}
                  vs{" "}
                  <span className="font-medium" style={{ color: "var(--risk-review-text)" }}>
                    check first
                  </span>
                  .
                </li>
                <li style={{ color: "var(--muted)" }}>
                  <span style={{ color: "var(--text)" }}>Clean</span> — preview removals, then delete or
                  move to Trash.
                </li>
              </ol>

              <div
                className="mt-8 rounded-xl border px-4 py-4 text-sm sm:text-[15px]"
                style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
              >
                <p style={{ color: "var(--text)" }}>
                  <span className="font-medium">Next scan scope: </span>
                  {options ? scopeLabel(options.scan_scope) : "Loading…"}
                </p>
                <button
                  type="button"
                  className="mt-3 text-sm font-medium underline decoration-slate-400/60 underline-offset-2 sm:text-[15px]"
                  style={{ color: "var(--accent)" }}
                  onClick={() => {
                    setSettingsPanel("preferences");
                    setSettingsOpen(true);
                  }}
                >
                  Adjust in Settings
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {!recoveryLayout && summary ? (
          <section className="flex min-h-0 flex-1 flex-col gap-2">
            {summary.scan_stopped_reason ? (
              <div
                className="shrink-0 rounded-lg border px-3 py-2 text-center text-xs leading-snug sm:text-sm"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface-muted)",
                  color: "var(--muted)",
                }}
                role="status"
              >
                {summary.scan_stopped_reason}
              </div>
            ) : null}

            <div className="results-layout min-h-0">
              <div className="results-area-overview">
                {sectionHeading("Overview")}
                <div
                  className="mt-1.5 rounded-xl border p-2.5 shadow-sm sm:p-3"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="min-w-0 text-center">
                      <p className="text-[9px] font-medium uppercase tracking-wide sm:text-[10px]" style={{ color: "var(--muted)" }}>
                        Reclaimable
                      </p>
                      <p
                        className="truncate text-lg font-semibold tabular-nums sm:text-2xl"
                        style={{ color: "var(--text)" }}
                        title={formatBytes(mainReclaim)}
                      >
                        {formatBytes(mainReclaim)}
                      </p>
                      <p className="text-[10px] sm:text-[11px]" style={{ color: "var(--muted)" }}>
                        {summary.totals.file_count.toLocaleString()} items
                      </p>
                    </div>
                    <div
                      className="min-w-0 rounded-lg px-2 py-1.5 text-center sm:rounded-xl sm:px-3 sm:py-2"
                      style={{ background: "var(--risk-safe-bg)" }}
                    >
                      <p className="text-[9px] font-medium sm:text-[10px]" style={{ color: "var(--risk-safe-text)" }}>
                        Usually safe
                      </p>
                      <p className="truncate text-sm font-semibold tabular-nums sm:text-base" style={{ color: "var(--risk-safe-text)" }}>
                        {formatBytes(summary.totals.safe_bytes)}
                      </p>
                      <p className="text-[9px] opacity-90 sm:text-[10px]" style={{ color: "var(--risk-safe-text)" }}>
                        {summary.safe_len.toLocaleString()} paths
                      </p>
                    </div>
                    <div
                      className="min-w-0 rounded-lg px-2 py-1.5 text-center sm:rounded-xl sm:px-3 sm:py-2"
                      style={{ background: "var(--risk-review-bg)" }}
                    >
                      <p className="text-[9px] font-medium sm:text-[10px]" style={{ color: "var(--risk-review-text)" }}>
                        Check first
                      </p>
                      <p className="truncate text-sm font-semibold tabular-nums sm:text-base" style={{ color: "var(--risk-review-text)" }}>
                        {formatBytes(summary.totals.review_bytes)}
                      </p>
                      <p className="text-[9px] opacity-90 sm:text-[10px]" style={{ color: "var(--risk-review-text)" }}>
                        {summary.review_len.toLocaleString()} paths
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="results-area-cleanup">
                {sectionHeading("Clean up")}
                <div
                  className="flex min-h-0 flex-1 flex-col rounded-xl border p-3 shadow-sm sm:p-4"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <p className="text-xs leading-snug sm:text-sm" style={{ color: "var(--muted)" }}>
                    {selectedPaths.length === 0
                      ? "Nothing selected — pick rows in the list or use shortcuts."
                      : `${selectedPaths.length.toLocaleString()} path(s) in the next action.`}
                  </p>
                  <div
                    className="mt-2 grid grid-cols-2 gap-2 border-t pt-2 sm:flex sm:flex-wrap sm:gap-x-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <button
                      type="button"
                      onClick={selectVisiblePage}
                      disabled={listRows.length === 0 || cleanBusy}
                      className="text-left text-xs font-medium disabled:opacity-40 sm:text-sm"
                      style={{ color: "var(--accent)" }}
                    >
                      Select visible page
                    </button>
                    <button
                      type="button"
                      onClick={() => void selectAllSafePaths()}
                      disabled={summary.safe_len === 0 || bulkSafeBusy || cleanBusy}
                      className="text-left text-xs font-medium disabled:opacity-40 sm:text-sm"
                      style={{ color: "var(--accent)" }}
                      title="Selects every path classified as usually safe"
                    >
                      {bulkSafeBusy ? "Selecting all safe…" : `All safe (${summary.safe_len.toLocaleString()})`}
                    </button>
                  </div>
                  <div
                    className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <label className="flex cursor-pointer items-center gap-2 text-xs sm:text-sm" style={{ color: "var(--muted)" }}>
                      <input
                        type="checkbox"
                        checked={dryRun}
                        disabled={cleanBusy}
                        onChange={(e) => setDryRun(e.target.checked)}
                      />
                      Preview only
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-xs sm:text-sm" style={{ color: "var(--muted)" }}>
                      <input
                        type="checkbox"
                        checked={useTrash}
                        disabled={cleanBusy}
                        onChange={(e) => setUseTrash(e.target.checked)}
                      />
                      Trash when possible
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => void runClean()}
                    disabled={selectedPaths.length === 0 || cleanBusy}
                    className={`mt-3 w-full rounded-full px-4 py-2.5 text-sm font-semibold transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-40 lg:w-auto lg:self-end ${
                      dryRun ? "bg-[var(--accent)]" : "bg-[var(--btn-clean-bg)]"
                    } text-[var(--btn-primary-text)]`}
                  >
                    {cleanBusy
                      ? dryRun
                        ? "Previewing…"
                        : "Deleting…"
                      : dryRun
                        ? "Run preview"
                        : "Clean up"}
                  </button>
                  {cleanBusy ? (
                    <div
                      className="mt-2 rounded-lg border px-2 py-1.5"
                      style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
                    >
                      <p className="text-[11px] font-medium leading-snug" style={{ color: "var(--text)" }}>
                        {!cleanProgress
                          ? `Starting cleanup for ${selectedPaths.length.toLocaleString()} path(s)…`
                          : cleanProgress.status === "preparing"
                            ? `Merging ${cleanProgress.total.toLocaleString()} path(s)…`
                            : cleanProgress.status === "starting"
                              ? "Preparing batch…"
                              : cleanProgress.total === 0
                                ? "Nothing to process."
                                : cleanProgress.status === "working"
                                  ? `Deleting ${cleanProgress.current} / ${cleanProgress.total}…`
                                  : cleanProgress.status === "ok"
                                    ? `Done ${cleanProgress.current} / ${cleanProgress.total}`
                                    : cleanProgress.status === "failed"
                                      ? `Failed ${cleanProgress.current} / ${cleanProgress.total}`
                                      : cleanProgress.status === "missing"
                                        ? `Already gone (${cleanProgress.current}/${cleanProgress.total})`
                                        : `${cleanProgress.status} (${cleanProgress.current}/${cleanProgress.total})`}
                      </p>
                      {cleanProgress?.path ? (
                        <p className="mt-0.5 truncate font-mono text-[10px]" style={{ color: "var(--mono-muted)" }}>
                          {cleanProgress.path}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {cleanResult ? (
                    <p
                      className="mt-2 border-t pt-2 text-xs leading-snug sm:text-sm"
                      style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                    >
                      {cleanResult.dry_run ? "Preview: " : "Done: "}
                      {cleanResult.removed_paths.length} location(s)
                      {cleanResult.selected_path_count != null &&
                      cleanResult.operation_count != null &&
                      cleanResult.selected_path_count > cleanResult.operation_count
                        ? ` (merged ${cleanResult.selected_path_count.toLocaleString()} → ${cleanResult.operation_count.toLocaleString()} ops)`
                        : ""}
                      , ~{formatBytes(cleanResult.bytes_freed_estimate)}.
                      {cleanResult.failed.length > 0 ? ` ${cleanResult.failed.length} failed.` : ""}
                    </p>
                  ) : null}
                </div>

                <details
                  className="shrink-0 rounded-xl border p-2.5 shadow-sm sm:p-3"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <summary className="cursor-pointer list-none text-xs font-semibold sm:text-sm" style={{ color: "var(--text)" }}>
                    Large files & duplicates
                  </summary>
                  <p className="mt-1 text-[10px] leading-snug sm:text-xs" style={{ color: "var(--muted)" }}>
                    Largest paths from this scan; optional duplicate check.
                  </p>
                  <div className="mt-2">
                    <button
                      type="button"
                      disabled={dupBusy}
                      onClick={() => void runDupes()}
                      className="rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-40 sm:text-sm"
                      style={{ borderColor: "var(--border)", color: "var(--text)" }}
                    >
                      {dupBusy ? "Working…" : "Find duplicate large files"}
                    </button>
                    <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto text-[10px] sm:max-h-28 sm:text-xs" style={{ color: "var(--muted)" }}>
                      {summary.large_files.slice(0, 12).map((f) => (
                        <li key={f.entry.path} className="truncate font-mono">
                          {formatBytes(f.entry.size_bytes)} — {f.entry.path}
                        </li>
                      ))}
                    </ul>
                    {dupes && dupes.length > 0 ? (
                      <p className="mt-1 text-[10px] sm:text-xs" style={{ color: "var(--muted)" }}>
                        {dupes.length} duplicate group(s).
                      </p>
                    ) : null}
                  </div>
                </details>
              </div>

              <div className="results-area-browse">
                <div className="shrink-0 space-y-1.5">
                  {sectionHeading("Browse & select")}
                  <p className="text-[11px] leading-snug sm:text-xs lg:hidden" style={{ color: "var(--muted)" }}>
                    Filter tabs and list — cleanup is above on small screens.
                  </p>
                  <p className="hidden text-xs leading-snug lg:block" style={{ color: "var(--muted)" }}>
                    Filter, toggle rows, paginate — only this list scrolls.
                  </p>
                  <div
                    className="flex flex-wrap gap-1.5 rounded-xl p-1 sm:gap-2"
                    style={{ background: "var(--tab-bg)" }}
                  >
                    {(
                      [
                        ["all", "Everything", summary.findings_len],
                        ["safe", "Quick wins", summary.safe_len],
                        ["review", "Needs review", summary.review_len],
                      ] as const
                    ).map(([id, label, count]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => selectTab(id)}
                        className="rounded-full px-2.5 py-1.5 text-left text-xs font-medium transition sm:px-3 sm:text-sm"
                        style={{
                          background: tab === id ? "var(--tab-active)" : "transparent",
                          color: tab === id ? "var(--text)" : "var(--muted)",
                          boxShadow: tab === id ? "var(--shadow)" : "none",
                        }}
                      >
                        <span>{label}</span>
                        <span className="ml-1 tabular-nums opacity-80">{count.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] sm:text-xs" style={{ color: "var(--muted)" }}>
                      {totalForFilter === 0
                        ? "No items in this filter"
                        : listLoading
                          ? "Loading…"
                          : listRows.length === 0
                            ? "Empty page"
                            : `${(listOffset + 1).toLocaleString()}–${(listOffset + listRows.length).toLocaleString()} of ${totalForFilter.toLocaleString()}`}
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={!canPrevPage || listLoading}
                        onClick={() => setListOffset((o) => Math.max(0, o - LIST_PAGE_SIZE))}
                        className="rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-40 sm:px-3 sm:text-sm"
                        style={{ borderColor: "var(--border)", color: "var(--text)" }}
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        disabled={!canNextPage || listLoading}
                        onClick={() => setListOffset((o) => o + LIST_PAGE_SIZE)}
                        className="rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-40 sm:px-3 sm:text-sm"
                        style={{ borderColor: "var(--border)", color: "var(--text)" }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  className="mt-1.5 min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-lg border p-1.5 pr-1 sm:space-y-2 sm:p-2"
                  style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
                >
                  {listRows.map((f) => (
                    <Row
                      key={f.entry.path}
                      f={f}
                      selected={!!selected[f.entry.path]}
                      onToggle={() => toggle(f.entry.path)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
