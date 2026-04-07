---
title: File recovery mode in Aerosol
description: Read-only folder scans, signature-based hits, media previews, and copy-out recovery — how it works and what it is not (yet).
date: 2026-04-07
---

# File recovery mode in Aerosol

Aerosol started as a **cleanup** tool: find reclaimable clutter, label risk, preview deletes. We’ve added a second mode, **File recovery**, for a different job: **locate files** under a path you choose, **inspect** them (including **image and video previews**), and **copy** selections into another folder — **without modifying the source**.

You switch modes from the app header (**Cleanup** | **File recovery**). Recovery uses its own Rust engine ([`aerosol_recovery`](https://github.com/januscaler/aerosol/tree/main/crates/aerosol_recovery)) behind the same Tauri shell.

## What it does today

- **Source** — Pick a folder with the system picker, type a path, or use volume shortcuts. The scanner walks that **directory tree** read-only.
- **Quick vs Deep** — *Quick* matches magic bytes and extensions. *Deep* also looks for known signatures in an early slice of each file (useful for embedded or misnamed data); it is slower.
- **Types** — Built-in filters include PNG, JPEG, ZIP, PDF, MP4, SQLite, and JSON (leave all unchecked to include every built-in signature).
- **Results** — Paginated list with categories; **Preview** on rows that are real image/video **files** (not “carved” offsets inside a container).
- **Recover** — Copies selected hits to an output folder you choose. Settings can remember that folder for the next dialog.
- **Safety** — Recovery does not write to the scan source; output always goes elsewhere. SSDs with TRIM and deleted data are still a limitation for any recovery story — we surface that in the UI.

## What it is not (yet)

This is **not** a full forensic or raw-partition undelete product: there is **no** NTFS MFT / ext4 inode / APFS catalog parser in the shipping path yet. **Carved** hits may appear in results but are **not** extracted as separate files in the current build.

Defaults and caps (e.g. max files per scan) live under **Settings → File recovery**.

## Try it

Binaries: [home page](/#download) or [GitHub Releases](https://github.com/januscaler/aerosol/releases). For step-by-step use, see the [user manual → File recovery](/manual#file-recovery).
