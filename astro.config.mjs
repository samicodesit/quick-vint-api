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
      filter: (page) => {
        const pathname = new URL(page).pathname;
        const excludedPaths = new Set([
          "/admin/",
          "/cancel/",
          "/email-templates/",
          "/phone-upload/",
          "/success/",
          "/ui-components/",
          "/ui-components/content-components/",
          "/uninstall/",
          "/unsubscribe/",
          "/updates/latest/",
          "/welcome/",
        ]);

        return !excludedPaths.has(pathname) && !pathname.startsWith("/welcome/");
      },
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});
