import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import { mkdir, rename } from "node:fs/promises";

import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://autolister.app",
  output: "static",
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => {
        const pathname = new URL(page).pathname.replace(/\/+$/, "") || "/";
        const excludedPaths = new Set([
          "/admin",
          "/home-us",
          "/app",
          "/app/auth/callback",
          "/app/chatgpt",
          "/oauth/consent",
          "/oauth/reviewer",
          "/auth/callback",
          "/cancel",
          "/customer-usage",
          "/email-templates",
          "/phone-upload",
          "/success",
          "/ui-components",
          "/ui-components/content-components",
          "/uninstall",
          "/unsubscribe",
          "/updates/latest",
          "/welcome",
        ]);

        return (
          !excludedPaths.has(pathname) && !pathname.startsWith("/welcome/")
        );
      },
    }),
    {
      name: "homepage-country-output",
      hooks: {
        "astro:build:done": async ({ dir }) => {
          // Vercel serves index.html before conditional rewrites. Keep the
          // shared source route for dev, but let CDN routing select build output.
          await mkdir(new URL("home-default/", dir), { recursive: true });
          await rename(
            new URL("index.html", dir),
            new URL("home-default/index.html", dir),
          );
        },
      },
    },
  ],

  vite: {
    cacheDir: ".astro/vite",
    plugins: [tailwindcss()],
  },
});
