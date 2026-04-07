---
title: User manual
description: How to run a scan, read results, and clean up safely with Aerosol.
---

# User manual

How to run a scan, read results, and clean up safely.

## First launch

Open the app and review **Settings** if you want to change scan scope, extra roots, or time budget. Defaults favor a quick, practical pass over your home (and related) locations.

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

## Tips

- When in doubt, keep dry-run on and read paths carefully.
- Closing or ignoring “review” items is fine — only selected rows are affected.
- Platform permissions (for example Trash or full disk) may prompt once per session depending on OS settings.
