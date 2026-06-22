import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://autolister.app",
  output: "static",
  integrations: [
    mdx(),
    sitemap({
      filter: (page) =>
        !page.endsWith("/uninstall/") && !page.endsWith("/email-templates/"),
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});
