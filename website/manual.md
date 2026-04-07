---
title: User manual
description: How to run cleanup and file recovery scans, read results, preview media, and clean or copy out safely with Aerosol.
---

# User manual

How to run a scan, read results, clean up safely, and use **File recovery** when you need read-only discovery and copy-out.

## macOS install (GitHub release builds)

**Apple Silicon (M1 / M2 / M3)** — download the **aarch64** or **arm64** `.dmg` from the [latest release](https://github.com/januscaler/aerosol/releases/latest), not the **x86_64** one (that build is for Intel Macs).

### “Aerosol” is damaged and can’t be opened

That message usually means **Gatekeeper** blocked an **unsigned** app (it is often **not** a corrupted download). Try, in order:

1. **Right-click** `Aerosol.app` → **Open** → confirm **Open** (first launch only).
2. **System Settings** → **Privacy & Security** → scroll to the message about Aerosol → **Open Anyway**.
3. In **Terminal**, clear the download quarantine flag (after copying the app to **Applications**):

   ```bash
   xattr -cr /Applications/Aerosol.app
   ```

   If you are still running from the mounted `.dmg`, use the path to the `.app` inside the disk image instead.

For a build that is trusted system-wide without those steps, the publisher must use an **Apple Developer ID** certificate and **notarization** ([Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/)).

## First launch

Open the app and use the header to choose **Cleanup** or **File recovery**. For cleanup, review **Settings → Preferences** if you want to change scan scope, extra roots, or time budget. For recovery defaults (scan mode, max files, remembered output folder), use **Settings → File recovery**. Defaults favor a quick, practical cleanup pass over your home (and related) locations.

## Running a scan

1. Click **Scan** and wait for the progress phase to finish.
2. When the scan completes, a summary shows counts and the largest files surfaced for this run.
3. Large scans stay paginated so the UI does not load every row at once.

## Understanding filters

- **All** — every finding from the current scan.
- **Safe** — items classified as safer to remove (still review if unsure).
- **Review** — items that may deserve a closer look before deletion.

## Selection and cleanup

- Use checkboxes to select individual paths, or select the visible page.
- **Select all safe** loads every safe path from the scan into the selection (useful for bulk cleanup).
- **Preview only (dry run)** estimates space without deleting; turn it off to perform real cleanup.
- **Move to Trash when possible** sends removals to the system Trash where supported instead of immediate permanent delete.
- Cleanup merges nested selections (for example a folder and files inside it) into minimal delete operations to reduce redundant work and prompts.
- Progress is shown during deletion; after a real cleanup, the list and summary refresh from the pruned cache.

## Large files & duplicates

The scan summary can list the largest files. The duplicate finder compares hashes for large files you select from that list — useful when reclaiming space from copies.

## File recovery

Use this mode when you want to **find** files by type under a path and **copy** them elsewhere without changing the source tree.

1. Switch the header to **File recovery**.
2. Set **Path to scan** (browse, type a path, or pick a volume shortcut).
3. Choose **Quick** (metadata + magic) or **Deep** (adds signature carving in an early portion of each file — slower). Optionally restrict **types** (PNG, JPEG, ZIP, PDF, MP4, SQLite, JSON); leave all unchecked to use every built-in signature.
4. Click **Run scan**. Progress updates while files are walked.
5. In **Browse & select**, use **Preview** on **image** and **video** rows (real files only — not carved hits inside another file). Select rows and **Recover to folder…** to copy into a destination you choose.
6. **New scan** clears the current results so you can change the source or options.

Recovery **never writes** to the scanned paths; it only reads and copies into the output folder. **Carved** hits may appear in the list but are not extracted as separate files in the current version. This mode scans a **folder tree**, not raw partitions or filesystem internals — SSDs with TRIM may still limit what is recoverable in practice.

## Tips

- When in doubt, keep dry-run on and read paths carefully.
- Closing or ignoring “review” items is fine — only selected rows are affected.
- Platform permissions (for example Trash or full disk) may prompt once per session depending on OS settings.
