import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    base: "./",
    plugins: [react(), tailwindcss()],
    // Reuse public assets (favicons etc.) from the existing Lit UI
    publicDir: path.resolve(here, "../ui/public"),
    define: {
      // Expose gateway port to client so resolveDefaultGatewayUrl() can use
      // the correct port (Electron uses 18790, standalone dev uses 18789).
      "import.meta.env.VITE_GATEWAY_PORT": JSON.stringify(
        process.env.VITE_GATEWAY_PORT ?? "18789",
      ),
      // Optional dev token: set VITE_GATEWAY_TOKEN in ui-react/.env.local so
      // the UI can connect when opened directly in a browser without Electron.
      // Never baked into production builds (only active in DEV mode).
      "import.meta.env.VITE_GATEWAY_TOKEN": JSON.stringify(
        process.env.VITE_GATEWAY_TOKEN ?? "",
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve(here, "./src"),
        "@gateway": path.resolve(here, "../src/gateway"),
      },
    },
    build: {
      // Output to a completely separate directory — NEVER touches dist/control-ui/
      // which is owned by the existing Lit UI.
      outDir: path.resolve(here, "../dist/control-ui-react"),
      emptyOutDir: true,
      sourcemap: true,
      chunkSizeWarningLimit: 1024,
      rollupOptions: {
        input: {
          main: path.resolve(here, "index.html"),
          setup: path.resolve(here, "setup.html"),
        },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "chunks/[name].js",
          assetFileNames: "assets/[name].[ext]",
        },
      },
    },
    server: {
      host: true,
      port: 5174,
      strictPort: true,
    },
  };
});
