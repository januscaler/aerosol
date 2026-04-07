#!/usr/bin/env node
/**
 * Writes public/latest-release.json for local VitePress dev / preview.
 * Same payload shape as CI: .github/workflows/release-tauri.yml (gh api ... --jq).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "../public/latest-release.json");

function usage() {
  console.log(`Usage: node scripts/fetch-latest-release.mjs [owner/repo] [--stub]

  fetch (default)  Query GitHub API and write public/latest-release.json
  --stub           Write a small offline placeholder (buttons render; URLs may 404)

Environment:
  VITE_GITHUB_REPO     Repo slug (default: januscaler/aerosol)
  GITHUB_TOKEN or GH_TOKEN   Optional bearer token (higher rate limits)

Examples:
  npm run fetch:latest-release
  npm run fetch:latest-release -- myfork/aerosol
  npm run stub:latest-release`);
}

const STUB = {
  tag_name: "v0.0.0-local",
  html_url: "https://github.com/januscaler/aerosol/releases/latest",
  published_at: new Date().toISOString(),
  assets: [
    {
      name: "Aerosol_0.0.0-local_aarch64.dmg",
      browser_download_url:
        "https://github.com/januscaler/aerosol/releases/download/v0.0.0-local/Aerosol_0.0.0-local_aarch64.dmg",
      size: 0,
    },
    {
      name: "Aerosol_0.0.0-local_x64-setup.exe",
      browser_download_url:
        "https://github.com/januscaler/aerosol/releases/download/v0.0.0-local/Aerosol_0.0.0-local_x64-setup.exe",
      size: 0,
    },
    {
      name: "aerosol_0.0.0-local_amd64.AppImage",
      browser_download_url:
        "https://github.com/januscaler/aerosol/releases/download/v0.0.0-local/aerosol_0.0.0-local_amd64.AppImage",
      size: 0,
    },
  ],
};

function parseArgs(argv) {
  const stub = argv.includes("--stub");
  const repoArg = argv.find((a) => a && !a.startsWith("-") && a.includes("/"));
  const repo =
    (process.env.VITE_GITHUB_REPO || "").trim() ||
    (repoArg ?? "") ||
    "januscaler/aerosol";
  return { stub, repo };
}

async function fetchLatest(repo) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status} for ${url}: ${text.slice(0, 300)}`);
  }
  const raw = await res.json();
  return {
    tag_name: raw.tag_name,
    html_url: raw.html_url,
    ...(raw.published_at != null ? { published_at: raw.published_at } : {}),
    assets: (raw.assets || []).map((a) => ({
      name: a.name,
      browser_download_url: a.browser_download_url,
      size: typeof a.size === "number" ? a.size : 0,
    })),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    usage();
    process.exit(0);
  }

  const { stub, repo } = parseArgs(argv);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  if (stub) {
    fs.writeFileSync(outPath, JSON.stringify(STUB, null, 2) + "\n", "utf8");
    console.warn(
      `Wrote stub ${outPath} (offline UI test; download URLs are placeholders unless you edit the file).`,
    );
    return;
  }

  const payload = await fetchLatest(repo);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath} — ${payload.tag_name}, ${payload.assets.length} asset(s) (${repo})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
