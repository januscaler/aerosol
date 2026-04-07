# Build VitePress → serve static files with Caddy (no separate nginx layer).
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . ./

ARG VITE_GITHUB_REPO=
ARG VITE_APP_VERSION=0.1.0
ARG VITE_RELEASE_TAG=
ARG VITE_ASSET_MAC_DMG=
ARG VITE_ASSET_WIN=
ARG VITE_ASSET_LINUX_APPIMAGE=
ARG VITE_SITE_URL=https://aerosol.januscaler.com

RUN if [ -n "$VITE_GITHUB_REPO" ]; then \
  for f in index.md compare.md; do \
    if [ -f "$f" ]; then \
      sed -i "s#https://github.com/januscaler/aerosol#https://github.com/${VITE_GITHUB_REPO}#g" "$f"; \
    fi; \
  done; \
fi

ENV VITE_GITHUB_REPO=$VITE_GITHUB_REPO
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV VITE_RELEASE_TAG=$VITE_RELEASE_TAG
ENV VITE_ASSET_MAC_DMG=$VITE_ASSET_MAC_DMG
ENV VITE_ASSET_WIN=$VITE_ASSET_WIN
ENV VITE_ASSET_LINUX_APPIMAGE=$VITE_ASSET_LINUX_APPIMAGE
ENV VITE_SITE_URL=$VITE_SITE_URL

RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/.vitepress/dist /srv
EXPOSE 80
