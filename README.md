# Aerosol

Tauri + React + TypeScript desktop app with a Rust workspace (`aerosol_core`, CLI, plugins). Marketing and docs live in `website/` (VitePress).

## Recommended IDE setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Releasing desktop builds + docs

1. Ensure **Actions → General → Workflow permissions** allows **Read and write** for the default `GITHUB_TOKEN` (needed for releases and `gh-pages`).
2. Create and push a tag: `git tag v0.2.0 && git push origin v0.2.0`
3. **`.github/workflows/release-tauri.yml`** will:
   - Sync `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` versions from the tag
   - Build **macOS** (Apple Silicon + Intel), **Windows**, and **Linux** bundles via [tauri-action](https://github.com/tauri-apps/tauri-action) and attach them to the GitHub Release
   - Resolve installer filenames, rebuild the **VitePress** site with direct download URLs, upload **`aerosol-website.zip`** to the release, and push the static site to the **`gh-pages`** branch (enable **Pages → Deploy from branch → gh-pages** in repo settings)

Optional Docker Hub push on tag: set repository variable **`PUSH_DOCKER_ON_RELEASE`** to `true` and configure secrets **`DOCKERHUB_USERNAME`** and **`DOCKERHUB_TOKEN`**.

Website Docker images for branch pushes (without tying to a release) still use **`.github/workflows/website-docker.yml`** when `website/` changes on the default branch.
