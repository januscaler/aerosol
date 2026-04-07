import { defineConfig } from "vitepress";

const repo = process.env.VITE_GITHUB_REPO?.trim() || "aerosol/aerosol";
const gh = `https://github.com/${repo}`;

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
      message: "Aerosol — docs & landing in the same monorepo as the desktop app.",
    },
    outline: { level: [2, 3] },
    search: { provider: "local" },
  },
  head: [["link", { rel: "icon", type: "image/png", href: "/logo.png" }]],
});
