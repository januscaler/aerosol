import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitepress";
import type { HeadConfig } from "vitepress";

const repo = process.env.VITE_GITHUB_REPO?.trim() || "januscaler/aerosol";
const gh = `https://github.com/${repo}`;
const siteUrl = (process.env.VITE_SITE_URL?.trim() || "https://aerosol.januscaler.com").replace(
  /\/$/,
  "",
);

/** URL path for sitemap / canonical (matches cleanUrls + VitePress output). */
function pageToPath(page: string): string {
  const noMd = page.slice(0, -3);
  if (noMd === "index") return "/";
  if (noMd.endsWith("/index")) {
    const base = noMd.slice(0, -6);
    return base ? `/${base}/` : "/";
  }
  return `/${noMd}`;
}

export default defineConfig({
  title: "Aerosol",
  description:
    "Aerosol — open-source local disk cleaner for macOS, Windows, and Linux. Transparent rules, risk-aware cleanup, preview before delete, optional Trash.",
  lang: "en-US",
  titleTemplate: ":title | Aerosol",
  srcDir: ".",
  srcExclude: ["README.md"],
  cleanUrls: true,
  lastUpdated: true,

  sitemap: {
    hostname: siteUrl,
  },

  themeConfig: {
    logo: "/logo.png",
    nav: [
      { text: "Home", link: "/" },
      { text: "Blog", link: "/blog/" },
      { text: "Manual", link: "/manual" },
      { text: "Compare", link: "/compare" },
    ],
    socialLinks: [{ icon: "github", link: gh }],
    footer: {
      message: `Deployed at ${siteUrl} · Source: github.com/${repo}`,
    },
    outline: { level: [2, 3] },
    search: { provider: "local" },
    sidebar: {
      "/blog/": [
        {
          text: "Blog",
          link: "/blog/",
        },
        {
          text: "Posts",
          items: [
            { text: "Introducing Aerosol", link: "/blog/introducing-aerosol" },
            { text: "Safe cleanup (macOS, Windows, Linux)", link: "/blog/safe-cleanup-cross-platform" },
            { text: "Risk levels and dry-run", link: "/blog/risk-levels-dry-run" },
          ],
        },
      ],
    },
  },

  head: [
    ["link", { rel: "icon", type: "image/png", href: "/logo.png" }],
    ["meta", { name: "theme-color", content: "#1e1e1e" }],
    ["meta", { property: "og:site_name", content: "Aerosol" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:url", content: siteUrl }],
    ["meta", { property: "og:image", content: `${siteUrl}/logo.png` }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:image", content: `${siteUrl}/logo.png` }],
    ["link", { rel: "preconnect", href: "https://github.com" }],
  ],

  transformHead({ page, title, description, pageData }) {
    const urlPath = pageToPath(page);
    const pageUrl = urlPath === "/" ? `${siteUrl}/` : `${siteUrl}${urlPath}`;
    const isBlogArticle = page.startsWith("blog/") && page !== "blog/index.md";
    const published = pageData.frontmatter.date as string | undefined;

    const tags: HeadConfig[] = [
      ["link", { rel: "canonical", href: pageUrl }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: description }],
      ["meta", { property: "og:url", content: pageUrl }],
      ["meta", { name: "twitter:title", content: title }],
      ["meta", { name: "twitter:description", content: description }],
    ];

    if (isBlogArticle) {
      tags.push(["meta", { property: "og:type", content: "article" }]);
      if (published) {
        const iso = published.includes("T") ? published : `${published}T12:00:00.000Z`;
        tags.push(["meta", { property: "article:published_time", content: iso }]);
      }
    }

    if (page === "index.md") {
      tags.push([
        "script",
        { type: "application/ld+json" },
        JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Aerosol",
          applicationCategory: "UtilitiesApplication",
          operatingSystem: "macOS, Windows, Linux",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          description,
          url: `${siteUrl}/`,
          image: `${siteUrl}/logo.png`,
          codeRepository: gh,
        }),
      ]);
    }

    return tags;
  },

  buildEnd(siteConfig) {
    const host = (siteConfig.userConfig.sitemap?.hostname || siteUrl).replace(/\/$/, "");
    const body = `# https://www.robotstxt.org/robotstxt.html
User-agent: *
Allow: /

Sitemap: ${host}/sitemap.xml
`;
    fs.writeFileSync(path.join(siteConfig.outDir, "robots.txt"), body, "utf8");
  },
});
