// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";
import AstroPWA from "@vite-pwa/astro";

// https://astro.build/config
export default defineConfig({
  output: "server",
  devToolbar: { enabled: false },
  integrations: [
    react(),
    sitemap(),
    AstroPWA({
      registerType: "prompt",
      injectRegister: null,
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      manifest: {
        name: "Vena",
        short_name: "Vena",
        description: "Kalkulator dat kwalifikowalności do oddawania krwi",
        theme_color: "#dc2626",
        background_color: "#0d0a0a",
        display: "standalone",
        lang: "pl",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globDirectory: "dist/client",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest}"],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      SUPABASE_KEY: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
    },
  },
});
