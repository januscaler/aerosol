import type { EnhanceAppContext } from "vitepress";
import DefaultTheme from "vitepress/theme";
import DownloadButtons from "../components/DownloadButtons.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }: EnhanceAppContext) {
    // Auto-import from `.vitepress/components` does not always apply to the home `Content` tree;
    // unresolved components SSR as empty `<!---->` and never hydrate (no download UI).
    app.component("DownloadButtons", DownloadButtons);
    // Alias: older `index.md` snippets used `<HomeDownloadBlock />` (component was removed).
    app.component("HomeDownloadBlock", DownloadButtons);
  },
};
