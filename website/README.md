# Aerosol marketing site & docs (VitePress)

[VitePress](https://vitepress.dev/) powers the landing page, user manual, and comparison doc. Content lives in Markdown at the repo root of `website/`; theme tweaks live under `.vitepress/`.

## Local development

```bash
cd website
npm install
npm run dev
```

## Production build

```bash
npm run build
```

Output: `website/.vitepress/dist/`. Test with `npm run preview`.

## Download buttons

Optional build-time environment variables (see `.env.example`):

- `VITE_GITHUB_REPO` — `owner/repo` for release URLs (also used by `.vitepress/config.ts` for the nav GitHub icon when set at build time).
- `VITE_RELEASE_TAG` — tag to append to `.../releases/download/<tag>/...` (e.g. `v0.2.0`).
- `VITE_ASSET_MAC_DMG`, `VITE_ASSET_WIN`, `VITE_ASSET_LINUX_APPIMAGE` — exact filenames attached to that release.

### CI injection (recommended)

Pushing a git tag `v*` runs **`.github/workflows/release-tauri.yml`**, which:

1. Builds macOS (Apple Silicon + Intel), Windows, and Linux bundles and uploads them to a GitHub Release for that tag.
2. Re-queries the release for `.dmg` / `.msi` (or `.exe`) / `.AppImage` names and rebuilds this site with those values baked in.
3. Uploads **`aerosol-website.zip`** to the same release and deploys the static site to the **`gh-pages`** branch (enable **Pages → Deploy from branch → gh-pages** in repo settings).

If assets are not set (local build), buttons fall back to the latest releases page; the Vue component still highlights a suggested platform from the visitor’s browser.

## Docker

Build context is the `website/` folder. **VitePress only produces static files** (`html`, `js`, `css`); the image still needs a tiny web server to answer HTTP. The final stage uses **[Caddy](https://caddyserver.com/)** (~50MB) with a short `Caddyfile` (`try_files` for extensionless URLs like `/manual` → `manual.html`), not nginx.

```bash
docker build \
  --build-arg VITE_GITHUB_REPO=your-org/aerosol \
  -t yourdockerhub/aerosol-website:latest .
```

Tag releases can also push this image: set repository variable **`PUSH_DOCKER_ON_RELEASE`** to `true` and configure **`DOCKERHUB_USERNAME`** / **`DOCKERHUB_TOKEN`** secrets (see `.github/workflows/release-tauri.yml`).

## Deploy with Compose

Use `docker-compose.yaml` or `im-docker-compose.yaml` (same content). Set `DOCKERHUB_USER` to your Docker Hub username, then:

```bash
docker compose -f im-docker-compose.yaml pull && docker compose -f im-docker-compose.yaml up -d
```

## GitHub Actions

- **Desktop + site + optional Docker on tag:** `.github/workflows/release-tauri.yml`
- **Website image on branch pushes:** `.github/workflows/website-docker.yml` (Docker Hub secrets)
