/// <reference types="vitepress/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_REPO?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_RELEASE_TAG?: string;
  readonly VITE_ASSET_MAC_DMG?: string;
  readonly VITE_ASSET_WIN?: string;
  readonly VITE_ASSET_LINUX_APPIMAGE?: string;
  /** Canonical public URL (footer, og:url). Default https://aerosol.januscaler.com */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
