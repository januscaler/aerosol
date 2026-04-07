---
title: Safe cleanup across macOS, Windows, and Linux
description: How Aerosol handles disk cleanup on macOS, Windows, and Linux — Trash, permanent delete, and why cross-platform tools still need platform-aware habits.
date: 2026-04-03
---

# Safe cleanup across macOS, Windows, and Linux

Aerosol uses one codebase for **macOS**, **Windows**, and **Linux**, but each OS has different trash APIs, permissions, and “safe” defaults. Here’s how to think about cleanup without surprises.

## Use preview first

Before any delete run, use **preview** (dry run) and scan the list. Large scans are paginated so you’re not scrolling thousands of rows blindly. If something looks unfamiliar, leave it unchecked.

## Trash vs permanent delete

Where the platform supports it, Aerosol can **move items to Trash** instead of deleting immediately. That’s the closest thing to an undo for bulk cleanup. Permanent delete is faster and irreversible — use it only when you’re sure.

## macOS Gatekeeper and downloads

Binaries from GitHub are **not notarized**. If macOS says the app is “damaged,” that’s usually **Gatekeeper**, not corruption. The [user manual](/manual#macos-install-github-release-builds) covers **Open Anyway**, `xattr`, and right-click **Open**.

## Linux paths and permissions

Some caches live under `~/.cache` or project dirs; others need elevated rights. Aerosol won’t silently escalate — work within your user’s home unless you deliberately run with broader permissions.

## Windows and long paths

Very deep `node_modules` or old build trees can hit path limits on some setups. If a path fails, shorten the tree or exclude that root from the scan and clean in smaller chunks.

Consistency matters: **preview → select → delete** beats “clean everything” every time.
