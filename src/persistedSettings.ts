import type { RecoveryScanMode, ScanOptions } from "./types";

const SCAN_KEY = "aerosol-scan-settings";
const THEME_KEY = "aerosol-theme";
const UI_KEY = "aerosol-ui-settings";
const RECOVERY_KEY = "aerosol-recovery-settings";

export const RECOVERY_SETTINGS_CHANGED = "aerosol-recovery-settings-changed";

export interface RecoveryPrefs {
  default_mode: RecoveryScanMode;
  /** Upper bound on files walked per scan (matches backend cap). */
  max_files: number;
  remember_output_folder: boolean;
  last_output_folder: string | null;
}

const DEFAULT_RECOVERY_PREFS: RecoveryPrefs = {
  default_mode: "quick",
  max_files: 50_000,
  remember_output_folder: false,
  last_output_folder: null,
};

export function loadRecoveryPrefs(): RecoveryPrefs {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return { ...DEFAULT_RECOVERY_PREFS };
    return { ...DEFAULT_RECOVERY_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_RECOVERY_PREFS };
  }
}

/** Replace all file-recovery preferences and notify listeners (e.g. RecoveryView). */
export function setRecoveryPrefs(p: RecoveryPrefs) {
  localStorage.setItem(RECOVERY_KEY, JSON.stringify(p));
  window.dispatchEvent(new CustomEvent(RECOVERY_SETTINGS_CHANGED));
}

/** Merge a partial update into saved recovery preferences. */
export function patchRecoveryPrefs(patch: Partial<RecoveryPrefs>) {
  setRecoveryPrefs({ ...loadRecoveryPrefs(), ...patch });
}

export type ThemeChoice = "system" | "light" | "dark";

export interface UiPrefs {
  default_dry_run: boolean;
  default_use_trash: boolean;
  /** Parallel delete/trash jobs during cleanup (1–1000). Recommended default: 4. */
  cleanup_parallelism: number;
}

const DEFAULT_UI: UiPrefs = {
  default_dry_run: true,
  default_use_trash: true,
  cleanup_parallelism: 4,
};

/** Upper bound matches `aerosol_core::cleanup` MAX_CLEANUP_PARALLELISM. */
export const CLEANUP_PARALLELISM_MAX = 1000;

export function clampCleanupParallelism(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_UI.cleanup_parallelism;
  return Math.min(CLEANUP_PARALLELISM_MAX, Math.max(1, Math.round(n)));
}

export type ScanSettingsPatch = Partial<
  Pick<
    ScanOptions,
    | "scan_scope"
    | "time_budget_secs"
    | "max_depth"
    | "max_entries_per_root"
    | "large_file_threshold_bytes"
    | "large_file_top_n"
    | "include_dangerous"
    | "extra_roots"
    | "skip_substrings"
    | "respect_gitignore"
  >
>;

export function loadScanPatch(): ScanSettingsPatch {
  try {
    const raw = localStorage.getItem(SCAN_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ScanSettingsPatch;
  } catch {
    return {};
  }
}

export function saveScanPatch(patch: ScanSettingsPatch) {
  localStorage.setItem(SCAN_KEY, JSON.stringify(patch));
}

export function mergeScanOptions(base: ScanOptions, patch: ScanSettingsPatch): ScanOptions {
  const out = { ...base };
  if (patch.scan_scope !== undefined) out.scan_scope = patch.scan_scope;
  if (patch.time_budget_secs !== undefined) out.time_budget_secs = patch.time_budget_secs;
  if (patch.max_depth !== undefined) out.max_depth = patch.max_depth;
  if (patch.max_entries_per_root !== undefined) out.max_entries_per_root = patch.max_entries_per_root;
  if (patch.large_file_threshold_bytes !== undefined)
    out.large_file_threshold_bytes = patch.large_file_threshold_bytes;
  if (patch.large_file_top_n !== undefined) out.large_file_top_n = patch.large_file_top_n;
  if (patch.include_dangerous !== undefined) out.include_dangerous = patch.include_dangerous;
  if (patch.extra_roots !== undefined) out.extra_roots = patch.extra_roots;
  if (patch.skip_substrings !== undefined) out.skip_substrings = patch.skip_substrings;
  if (patch.respect_gitignore !== undefined) out.respect_gitignore = patch.respect_gitignore;
  return out;
}

export function loadTheme(): ThemeChoice {
  const v = localStorage.getItem(THEME_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

export function saveTheme(t: ThemeChoice) {
  localStorage.setItem(THEME_KEY, t);
}

export function loadUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return { ...DEFAULT_UI };
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      ...DEFAULT_UI,
      ...parsed,
      cleanup_parallelism: clampCleanupParallelism(
        parsed.cleanup_parallelism ?? DEFAULT_UI.cleanup_parallelism,
      ),
    };
  } catch {
    return { ...DEFAULT_UI };
  }
}

export function saveUiPrefs(p: UiPrefs) {
  localStorage.setItem(UI_KEY, JSON.stringify(p));
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "light" || choice === "dark") return choice;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
