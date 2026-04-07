<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

type OsKind = "mac" | "win" | "linux" | "unknown";

function detectOs(): OsKind {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac os") || ua.includes("macintosh")) return "mac";
  if (ua.includes("win")) return "win";
  if (ua.includes("linux") || ua.includes("android")) return "linux";
  return "unknown";
}

const env = import.meta.env;
const os = ref<OsKind>("unknown");

const releasesLatest = computed(() => {
  const r = env.VITE_GITHUB_REPO as string | undefined;
  if (r?.includes("/")) return `https://github.com/${r}/releases/latest`;
  return "https://github.com/januscaler/aerosol/releases/latest";
});

function assetUrl(filename: string | undefined): string | null {
  if (!filename) return null;
  const repo = env.VITE_GITHUB_REPO as string | undefined;
  const tag =
    (env.VITE_RELEASE_TAG as string | undefined) ||
    `v${(env.VITE_APP_VERSION as string | undefined) ?? "0.1.0"}`;
  if (!repo?.includes("/")) return null;
  return `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(filename)}`;
}

const macHref = computed(() => assetUrl(env.VITE_ASSET_MAC_DMG as string | undefined) ?? releasesLatest.value);
const winHref = computed(() => assetUrl(env.VITE_ASSET_WIN as string | undefined) ?? releasesLatest.value);
const linuxHref = computed(
  () => assetUrl(env.VITE_ASSET_LINUX_APPIMAGE as string | undefined) ?? releasesLatest.value,
);

const winLabel = computed(() => {
  const w = env.VITE_ASSET_WIN as string | undefined;
  if (!w) return "Windows (.msi)";
  if (/\.exe$/i.test(w)) return "Windows (.exe)";
  return "Windows (.msi)";
});

const hint = computed(() => {
  const hasAny = Boolean(
    env.VITE_ASSET_MAC_DMG || env.VITE_ASSET_WIN || env.VITE_ASSET_LINUX_APPIMAGE,
  );
  if (hasAny) {
    return "Direct links point at this version’s GitHub release assets (injected automatically in CI when you publish a tag).";
  }
  const o = os.value;
  const kind =
    o === "mac" ? ".dmg" : o === "win" ? "installer" : o === "linux" ? "AppImage or package" : "build";
  return `No per-platform asset env set — buttons open the latest GitHub release so visitors can pick the right ${kind} for their system.`;
});

onMounted(() => {
  os.value = detectOs();
});
</script>

<template>
  <div class="download-grid">
    <a
      class="dl-btn"
      :class="{ recommended: os === 'mac' }"
      :href="macHref"
      rel="noopener noreferrer"
    >
      <span v-if="os === 'mac'" class="badge-suggested">Suggested</span>
      macOS (.dmg)
    </a>
    <a
      class="dl-btn"
      :class="{ recommended: os === 'win' }"
      :href="winHref"
      rel="noopener noreferrer"
    >
      <span v-if="os === 'win'" class="badge-suggested">Suggested</span>
      {{ winLabel }}
    </a>
    <a
      class="dl-btn"
      :class="{ recommended: os === 'linux' }"
      :href="linuxHref"
      rel="noopener noreferrer"
    >
      <span v-if="os === 'linux'" class="badge-suggested">Suggested</span>
      Linux (.AppImage)
    </a>
  </div>
  <p class="download-hint">{{ hint }}</p>
</template>

<style scoped>
.recommended {
  box-shadow: 0 0 0 2px var(--vp-c-green-2);
  border-radius: 8px;
}
</style>
