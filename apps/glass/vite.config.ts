import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

import { DEV_PROXIED_PATH_PREFIXES } from "@t3tools/shared/devProxy";

// Glass is a second client for the same T3 server. Dev is single-origin like
// apps/web: backend paths are proxied to the server port, so the app works from
// any origin (localhost, tailnet, LAN) without baking a server URL in.
const port = Number(process.env.GLASS_PORT ?? 5833);
const serverPort = Number(process.env.T3CODE_PORT ?? 13773);
const devProxyTarget = `http://localhost:${serverPort}/`;

const configuredAllowedHosts = (process.env.T3CODE_DEV_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

export default defineConfig({
  plugins: [
    react(),
    babel({
      parserOpts: { plugins: ["typescript", "jsx"] },
      presets: [reactCompilerPreset()],
    }),
    tailwindcss(),
  ],
  optimizeDeps: {
    include: ["@pierre/diffs", "@pierre/diffs/react", "react-dom/client"],
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: process.env.HOST?.trim() || "localhost",
    port,
    strictPort: true,
    allowedHosts: [".ts.net", ...configuredAllowedHosts],
    proxy: Object.fromEntries(
      DEV_PROXIED_PATH_PREFIXES.map((prefix) => [
        prefix,
        {
          target: devProxyTarget,
          changeOrigin: true,
          ...(prefix === "/ws" || prefix === "/api" ? { ws: true } : {}),
        },
      ]),
    ),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
