<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

type OsKind = "mac" | "win" | "linux" | "unknown";

interface GhAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GhReleasePayload {
  tag_name: string;
  html_url: string;
  published_at?: string;
  assets: GhAsset[];
}

type LoadState = "loading" | "ready" | "fallback";

function detectOs(): OsKind {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac os") || ua.includes("macintosh")) return "mac";
  if (ua.includes("win")) return "win";
  if (ua.includes("linux") || ua.includes("android")) return "linux";
  return "unknown";
}

/** Heuristic: Apple Silicon reports arm64 in UA on recent Safari/Chrome. */
function preferAppleSiliconDmg(): boolean {
  if (typeof navigator === "undefined") return true;
  return /\barm64\b|\baarch64\b/i.test(navigator.userAgent);
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function pickDmg(assets: GhAsset[], preferArm: boolean): GhAsset | null {
  const dmgs = assets.filter((a) => /\.dmg$/i.test(a.name));
  if (dmgs.length === 0) return null;
  const find = (re: RegExp) => dmgs.find((a) => re.test(a.name));
  if (find(/universal/i)) return find(/universal/i)!;
  if (preferArm) {
    if (find(/aarch64|arm64/i)) return find(/aarch64|arm64/i)!;
    if (find(/x86_64|x64/i)) return find(/x86_64|x64/i)!;
  } else {
    if (find(/x86_64|x64|intel/i)) return find(/x86_64|x64|intel/i)!;
    if (find(/aarch64|arm64/i)) return find(/aarch64|arm64/i)!;
  }
  return dmgs[0];
}

function pickWin(assets: GhAsset[]): GhAsset | null {
  const msi = assets.find((a) => /\.msi$/i.test(a.name));
  if (msi) return msi;
  const exe = assets.find((a) => /\.exe$/i.test(a.name) && !/uninstall/i.test(a.name));
  return exe ?? null;
}

function pickLinux(assets: GhAsset[]): GhAsset | null {
  const app = assets.find((a) => /\.AppImage$/i.test(a.name));
  if (app) return app;
  return assets.find((a) => /\.deb$/i.test(a.name)) ?? null;
}

function parseRepo(): { owner: string; repo: string } {
  const r = (import.meta.env.VITE_GITHUB_REPO as string | undefined)?.trim() || "januscaler/aerosol";
  const [owner, repo] = r.split("/");
  return { owner: owner || "januscaler", repo: repo || "aerosol" };
}

const env = import.meta.env;
const os = ref<OsKind>("unknown");
const state = ref<LoadState>("loading");
const release = ref<GhReleasePayload | null>(null);
const loadError = ref<string | null>(null);

const releasesLatest = computed(() => {
  const { owner, repo } = parseRepo();
  return `https://github.com/${owner}/${repo}/releases/latest`;
});

const apiLatest = computed(() => {
  const { owner, repo } = parseRepo();
  return `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
});

function assetFromEnvMac(): GhAsset | null {
  const name = env.VITE_ASSET_MAC_DMG as string | undefined;
  const tag =
    (env.VITE_RELEASE_TAG as string | undefined) ||
    (env.VITE_APP_VERSION ? `v${env.VITE_APP_VERSION}` : undefined);
  const repo = env.VITE_GITHUB_REPO as string | undefined;
  if (!name || !tag || !repo?.includes("/")) return null;
  return {
    name,
    browser_download_url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`,
    size: 0,
  };
}

function assetFromEnvWin(): GhAsset | null {
  const name = env.VITE_ASSET_WIN as string | undefined;
  const tag =
    (env.VITE_RELEASE_TAG as string | undefined) ||
    (env.VITE_APP_VERSION ? `v${env.VITE_APP_VERSION}` : undefined);
  const repo = env.VITE_GITHUB_REPO as string | undefined;
  if (!name || !tag || !repo?.includes("/")) return null;
  return {
    name,
    browser_download_url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`,
    size: 0,
  };
}

function assetFromEnvLinux(): GhAsset | null {
  const name = env.VITE_ASSET_LINUX_APPIMAGE as string | undefined;
  const tag =
    (env.VITE_RELEASE_TAG as string | undefined) ||
    (env.VITE_APP_VERSION ? `v${env.VITE_APP_VERSION}` : undefined);
  const repo = env.VITE_GITHUB_REPO as string | undefined;
  if (!name || !tag || !repo?.includes("/")) return null;
  return {
    name,
    browser_download_url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`,
    size: 0,
  };
}

const macAsset = computed(() => {
  const a = release.value?.assets;
  if (a?.length) return pickDmg(a, preferAppleSiliconDmg());
  return assetFromEnvMac();
});

const winAsset = computed(() => {
  const a = release.value?.assets;
  if (a?.length) return pickWin(a);
  return assetFromEnvWin();
});

const linuxAsset = computed(() => {
  const a = release.value?.assets;
  if (a?.length) return pickLinux(a);
  return assetFromEnvLinux();
});

const primary = computed(() => {
  const o = os.value;
  if (o === "mac") return { kind: "mac" as const, asset: macAsset.value, label: "Download for macOS" };
  if (o === "win") return { kind: "win" as const, asset: winAsset.value, label: "Download for Windows" };
  if (o === "linux") return { kind: "linux" as const, asset: linuxAsset.value, label: "Download for Linux" };
  return null;
});

const publishedLabel = computed(() => {
  const p = release.value?.published_at;
  if (!p) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(p));
  } catch {
    return p;
  }
});

async function tryFetchJson(url: string): Promise<GhReleasePayload | null> {
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as GhReleasePayload;
  if (!data?.tag_name || !Array.isArray(data.assets)) return null;
  return data;
}

async function loadRelease(): Promise<void> {
  state.value = "loading";
  loadError.value = null;

  const rawBase = ((import.meta.env.BASE_URL as string) || "/").replace(/\/$/, "");
  const jsonUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${rawBase === "" ? "" : rawBase}/latest-release.json`
      : "";

  try {
    let data = jsonUrl ? await tryFetchJson(jsonUrl) : null;
    if (!data) {
      data = await tryFetchJson(apiLatest.value);
    }

    if (data && data.assets.length > 0) {
      release.value = data;
      state.value = "ready";
      return;
    }

    const synthetic: GhAsset[] = [];
    const m = assetFromEnvMac();
    const w = assetFromEnvWin();
    const l = assetFromEnvLinux();
    if (m) synthetic.push(m);
    if (w) synthetic.push(w);
    if (l) synthetic.push(l);

    if (synthetic.length > 0) {
      release.value = {
        tag_name: (env.VITE_RELEASE_TAG as string) || `v${(env.VITE_APP_VERSION as string) || "0"}`,
        html_url: releasesLatest.value,
        assets: synthetic,
      };
      state.value = "ready";
      return;
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : "Could not load release info";
  }

  state.value = "fallback";
}

onMounted(() => {
  os.value = detectOs();
  void loadRelease();
});

function platformSubtitle(kind: "mac" | "win" | "linux", asset: GhAsset | null): string {
  if (!asset) return "Open the release page and pick an installer.";
  const size = asset.size > 0 ? ` · ${formatBytes(asset.size)}` : "";
  if (kind === "mac") return `Disk image (.dmg)${size}`;
  if (kind === "win") {
    if (/\.exe$/i.test(asset.name)) return `Setup (.exe)${size}`;
    return `Installer (.msi)${size}`;
  }
  if (/\.deb$/i.test(asset.name)) return `Debian package (.deb)${size}`;
  return `AppImage${size}`;
}
</script>

<template>
  <div class="download-section">
    <p v-if="state === 'loading'" class="download-status" aria-live="polite">Loading latest release from GitHub…</p>

    <template v-else-if="state === 'ready' && release">
      <p class="download-meta">
        <strong>Latest release:</strong> {{ release.tag_name }}
        <span v-if="publishedLabel"> · {{ publishedLabel }}</span>
      </p>

      <!-- Primary: visitor's platform -->
      <div v-if="primary && primary.asset" class="download-primary">
        <p class="download-primary-label">Recommended for you</p>
        <a
          class="dl-btn dl-btn--hero"
          :href="primary.asset.browser_download_url"
          rel="noopener noreferrer"
        >
          {{ primary.label }}
        </a>
        <p class="download-sub">{{ platformSubtitle(primary.kind, primary.asset) }}</p>
        <p class="download-filename">{{ primary.asset.name }}</p>
      </div>

      <div v-else-if="primary && !primary.asset" class="download-primary download-primary--missing">
        <p class="download-primary-label">We detected {{ primary.kind === "mac" ? "macOS" : primary.kind === "win" ? "Windows" : "Linux" }}</p>
        <a class="dl-btn dl-btn--hero" :href="release.html_url" rel="noopener noreferrer">
          Open this release on GitHub
        </a>
        <p class="download-sub">Choose the right file for your system from the assets list.</p>
      </div>

      <p v-if="os === 'unknown'" class="download-sub">Pick your platform below.</p>

      <p class="download-other-title">All desktop builds</p>
      <div class="download-grid">
        <a
          v-if="macAsset"
          class="dl-btn"
          :class="{ recommended: os === 'mac' }"
          :href="macAsset.browser_download_url"
          rel="noopener noreferrer"
        >
          <span v-if="os === 'mac'" class="badge-suggested">Your OS</span>
          macOS
        </a>
        <a v-else class="dl-btn dl-btn--muted" :href="release.html_url" rel="noopener noreferrer"> macOS — on GitHub </a>

        <a
          v-if="winAsset"
          class="dl-btn"
          :class="{ recommended: os === 'win' }"
          :href="winAsset.browser_download_url"
          rel="noopener noreferrer"
        >
          <span v-if="os === 'win'" class="badge-suggested">Your OS</span>
          Windows
        </a>
        <a v-else class="dl-btn dl-btn--muted" :href="release.html_url" rel="noopener noreferrer"> Windows — on GitHub </a>

        <a
          v-if="linuxAsset"
          class="dl-btn"
          :class="{ recommended: os === 'linux' }"
          :href="linuxAsset.browser_download_url"
          rel="noopener noreferrer"
        >
          <span v-if="os === 'linux'" class="badge-suggested">Your OS</span>
          Linux
        </a>
        <a v-else class="dl-btn dl-btn--muted" :href="release.html_url" rel="noopener noreferrer"> Linux — on GitHub </a>
      </div>

      <p class="download-hint">
        <a :href="release.html_url" rel="noopener noreferrer">Release notes and all files</a>
        ·
        <a :href="releasesLatest" rel="noopener noreferrer">Latest release (redirect)</a>
      </p>
    </template>

    <!-- API blocked, no JSON, no build-time assets -->
    <template v-else>
      <p v-if="loadError" class="download-status download-status--warn">{{ loadError }}</p>
      <p class="download-meta">
        <a class="dl-btn dl-btn--hero" :href="releasesLatest" rel="noopener noreferrer"> Open latest release on GitHub </a>
      </p>
      <p class="download-sub">
        <template v-if="os === 'mac'">
          On the release page, download the <strong>.dmg</strong> file (Apple Silicon builds often include <code>aarch64</code> or <code>arm64</code> in the name; Intel Macs use <code>x86_64</code>).
        </template>
        <template v-else-if="os === 'win'">
          On the release page, download the <strong>.msi</strong> or <strong>.exe</strong> installer.
        </template>
        <template v-else-if="os === 'linux'">
          On the release page, download the <strong>.AppImage</strong> (or <strong>.deb</strong> if you prefer).
        </template>
        <template v-else> Choose the file that matches your operating system from the assets list. </template>
      </p>
      <div class="download-grid">
        <a class="dl-btn" :href="releasesLatest" rel="noopener noreferrer">macOS help →</a>
        <a class="dl-btn" :href="releasesLatest" rel="noopener noreferrer">Windows help →</a>
        <a class="dl-btn" :href="releasesLatest" rel="noopener noreferrer">Linux help →</a>
      </div>
    </template>
  </div>
</template>

<style scoped>
.download-section {
  margin-top: 0.5rem;
}

.download-status {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}

.download-status--warn {
  color: var(--vp-c-yellow-2);
}

.download-meta {
  margin: 0 0 1rem;
  font-size: 0.95rem;
  color: var(--vp-c-text-2);
}

.download-meta strong {
  color: var(--vp-c-text-1);
}

.download-primary {
  margin: 0 0 1.5rem;
  padding: 1.25rem 1.35rem;
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.download-primary--missing {
  border-style: dashed;
}

.download-primary-label {
  margin: 0 0 0.65rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--vp-c-text-2);
}

.download-sub {
  margin: 0.5rem 0 0;
  font-size: 0.88rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.download-filename {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-3);
  word-break: break-all;
}

.download-other-title {
  margin: 1.25rem 0 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vp-c-text-2);
}

.download-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.dl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-height: 44px;
  padding: 0 1rem;
  font-weight: 600;
  font-size: 0.92rem;
  border-radius: 8px;
  text-decoration: none !important;
  color: var(--vp-button-brand-text) !important;
  background-color: var(--vp-button-brand-bg);
  transition: background-color 0.2s;
  text-align: center;
}

.dl-btn:hover {
  background-color: var(--vp-button-brand-hover);
}

.dl-btn--hero {
  width: 100%;
  max-width: 22rem;
  min-height: 52px;
  font-size: 1.05rem;
}

.dl-btn--muted {
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1) !important;
  border: 1px solid var(--vp-c-divider);
}

.dl-btn--muted:hover {
  background-color: var(--vp-c-bg-mute);
}

.recommended {
  box-shadow: 0 0 0 2px var(--vp-c-green-2);
}

.download-hint {
  margin-top: 1.25rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.download-hint a {
  font-weight: 500;
}

.badge-suggested {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  margin-right: 0.25rem;
  background: color-mix(in srgb, var(--vp-c-green-1) 22%, transparent);
  color: var(--vp-c-green-1);
  font-weight: 700;
}
</style>
