---
layout: home
title: Aerosol
description: Open-source disk cleanup for macOS, Windows, and Linux — transparent rules, risk-aware results, preview before delete, optional Trash. Download from GitHub Releases.

hero:
  name: Aerosol
  text: Disk cleanup that stays transparent and local
  tagline: Scan caches, logs, and dev clutter with clear risk levels — preview or delete in one pass, with optional Trash support.
  image:
    src: /logo.png
    alt: Aerosol
  actions:
    - theme: brand
      text: Download
      link: "#download"
    - theme: alt
      text: Blog
      link: /blog/
    - theme: alt
      text: User manual
      link: /manual
    - theme: alt
      text: Compare
      link: /compare

features:
  - title: Risk-aware results
    details: Filter safe items vs. ones that deserve a second look — not a single opaque “clean now” button.
  - title: Preview and batch control
    details: Dry-run preview, paginated lists for huge scans, select all safe, and merged delete operations for nested paths.
  - title: Trash or permanent delete
    details: Move to Trash when supported, or delete permanently when you are sure.
  - title: Plugins and heuristics
    details: Built-in awareness of tools like Docker, Git, and common caches — designed to grow.
  - title: Large files & duplicates
    details: Surfaces the biggest files from the scan and optional duplicate checks to reclaim space without guesswork.
  - title: Desktop app, not a service
    details: Tauri-powered native shell — no account wall and no upload of your file list to our servers.
---

## Download

Installers come from the **latest GitHub release**. Your platform is detected in the browser; the big button is the best match (for example the **Apple Silicon** `.dmg` on M1/M2/M3 — not the x86_64 disk image).

**macOS:** Unsigned builds may show *“damaged”* — that is usually **Gatekeeper**, not a bad file. See the [manual → macOS install](manual#macos-install-github-release-builds).

<DownloadButtons />

## Blog

Longer updates and cleanup guides live on the [Aerosol blog](/blog/).

## Open source

Inspect the scanner, rules, and UI on [GitHub](https://github.com/januscaler/aerosol). Issues and contributions welcome.
