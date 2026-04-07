import { defineConfig } from "vitepress";

const repo = process.env.VITE_GITHUB_REPO?.trim() || "januscaler/aerosol";
const gh = `https://github.com/${repo}`;
const siteUrl = (process.env.VITE_SITE_URL?.trim() || "https://aerosol.januscaler.com").replace(
  /\/$/,
  "",
);

export default defineConfig({
  title: "Aerosol",
  description:
    "Local disk cleaner for macOS, Windows, and Linux — transparent rules, risk-aware cleanup, optional Trash support.",
  srcDir: ".",
  srcExclude: ["README.md"],
  cleanUrls: true,
  themeConfig: {
    logo: "/logo.png",
    nav: [
      { text: "Home", link: "/" },
      { text: "Manual", link: "/manual" },
      { text: "Compare", link: "/compare" },
    ],
    socialLinks: [{ icon: "github", link: gh }],
    footer: {
      message: `Deployed at ${siteUrl} · Source: github.com/${repo}`,
    },
    outline: { level: [2, 3] },
    search: { provider: "local" },
  },
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/logo.png" }],
    ["meta", { property: "og:url", content: siteUrl }],
  ],
});
