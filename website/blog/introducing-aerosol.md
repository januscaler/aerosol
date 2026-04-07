---
title: Introducing Aerosol
description: Aerosol is an open-source, local disk cleaner for macOS, Windows, and Linux — with risk-aware results and optional Trash instead of a single “clean now” button.
date: 2026-04-01
---

# Introducing Aerosol

**Aerosol** is a desktop app for finding caches, logs, and developer clutter you can actually understand before you delete anything. It runs on **macOS** (Apple Silicon and Intel), **Windows**, and **Linux**, built with [Tauri](https://tauri.app/) so the UI stays fast and your file list never needs our servers.

## Who it’s for

- People who outgrew “free cleaner” apps that hide what they remove  
- Developers with Docker layers, old `node_modules`, and tool caches  
- Anyone who wants **dry-run preview**, **risk hints**, and **Trash** (where the OS supports it) instead of irreversible one-tap wipes  

## What makes it different

| Idea | How Aerosol approaches it |
| --- | --- |
| Transparency | Open source — scan rules and UI are on [GitHub](https://github.com/januscaler/aerosol). |
| Control | You pick categories and paths; we don’t “optimize” your disk in secret. |
| Safety | Items are grouped so **safe** junk is easier to separate from things that deserve a second look. |

## Try it

Installers are on the [home page](/#download) and [GitHub Releases](https://github.com/januscaler/aerosol/releases). On Apple Silicon Macs, grab the **aarch64** `.dmg`; unsigned builds may need a one-time **Open** from the right-click menu — see the [manual → macOS install](/manual#macos-install-github-release-builds).

We’re early; expect rough edges and [issues](https://github.com/januscaler/aerosol/issues) welcome.
