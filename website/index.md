---
layout: home
title: Aerosol
description: Open-source disk utility for macOS, Windows, and Linux — risk-aware cleanup with optional Trash, plus read-only file recovery with media previews and copy-out. Download from GitHub Releases.

hero:
  name: Aerosol
  text: Cleanup and file recovery — transparent and local
  tagline: >-
    <span class="hero-tagline-lead">Cleanup</span> reclaims space from caches and dev clutter — risk levels,
    paginated results, dry-run preview, batch selection, optional Move to Trash.<br /><br />
    <span class="hero-tagline-lead">File recovery</span> scans a directory you choose read-only, matches common
    types (quick or deep), previews images and videos, copies hits elsewhere — never writes to the source.
    No account; paths stay on your device.
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
  - title: File recovery mode
    details: Read-only scans of a folder you pick, signature-based hits, quick vs deep pass, image and video previews, and copy recovered files to a safe output folder — separate from cleanup, no writes to the source tree.
  - title: Desktop app, not a service
    details: Tauri-powered native shell — no account wall and no upload of your file list to our servers.
---

## App preview

**Cleanup** mode after a scan: **reclaimable space**, **Usually safe** vs **Check first**, filters, and paginated rows before you run cleanup. **File recovery** mode: scan results, **Preview** on media rows, and **Recover to folder**.

<div class="home-preview-shots">

![Aerosol main window showing scan overview, safe and review totals, and browse filters](/screenshots/screen1.png)

![Aerosol list view with row selection, risk labels, and pagination](/screenshots/screen2.png)

![Aerosol file recovery mode with hits list, preview control, and recover panel](/screenshots/screen3.png)

</div>

## Download

Installers come from the **latest GitHub release**. Your platform is detected in the browser; the big button is the best match (for example the **Apple Silicon** `.dmg` on M1/M2/M3 — not the x86_64 disk image).

**macOS:** Unsigned builds may show *“damaged”* — that is usually **Gatekeeper**, not a bad file. See the [manual → macOS install](manual#macos-install-github-release-builds).

<DownloadButtons />

## Blog

Longer updates and cleanup guides live on the [Aerosol blog](/blog/).

## Open source

Inspect the scanner, rules, and UI on [GitHub](https://github.com/januscaler/aerosol). Issues and contributions welcome.
