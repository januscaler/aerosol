---
title: Risk levels and dry-run preview
description: How Aerosol labels scan results with risk levels, merges nested paths for cleanup, and why dry-run preview stays the default workflow.
date: 2026-04-05
---

# Risk levels and dry-run preview

Aerosol’s scan results are grouped so you can filter **safer** candidates (typical caches, logs you can regenerate) from items that need **review** (anything ambiguous or tied to apps you still use).

## Why “risk” instead of a single list

Opaque “junk file” lists train people to click **Clean all**. We’d rather show **what** matched and **why**, so you can align deletes with your comfort level — especially on dev machines where a “cache” might still be warming up the next build.

## Dry-run by default

The workflow encourages **preview** before delete: you see sizes, paths, and merged selections. Batch operations still apply to explicit choices — nothing is removed until you confirm.

## Merged paths and nested folders

When many files sit under one tree, Aerosol can **merge** nested paths so you’re not toggling hundreds of checkboxes for one directory. Expand when you need line-by-line control.

## Plugins and heuristics

Built-in awareness (Docker, Git, common dev caches) will grow over time. If a rule feels wrong for your setup, [open an issue](https://github.com/januscaler/aerosol/issues) — heuristics should stay explainable, not magical.

Risk labels are hints, not guarantees. Backups and version control still beat any cleaner when something matters.
