import { defineConfig } from "vite";
import { version } from "./package.json";
import { VitePWA } from "vite-plugin-pwa";

// A Pages user/organization site lives at /; project sites live at /repository/.
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base =
  process.env.VITE_BASE_PATH ??
  (process.env.GITHUB_ACTIONS && repo && !repo.endsWith(".github.io")
    ? `/${repo}/`
    : "/");
export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Tiny Tanks",
        short_name: "Tiny Tanks",
        description: "Small tanks. Big trouble. Offline artillery battles.",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "any",
        background_color: "#111e27",
        theme_color: "#111e27",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 4_000_000,
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: { output: { manualChunks: { phaser: ["phaser"] } } },
  },
});
