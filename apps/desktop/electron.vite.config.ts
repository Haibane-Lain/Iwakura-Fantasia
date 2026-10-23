import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    resolve: {
      alias: {
        "@iwakura/server": resolve(__dirname, "../server/src/index.ts"),
      },
    },
    ssr: {
      noExternal: true,
    },
    build: {
      // Bundle the workspace server and its dependencies into the main process.
      // We have no native modules, so this keeps packaging to a single JS file.
      externalizeDeps: false,
      rollupOptions: {
        output: {
          format: "cjs",
        },
      },
    },
  },
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer/src"),
      },
    },
  },
});
