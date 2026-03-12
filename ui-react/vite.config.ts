import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    base: "/",
    plugins: [react(), tailwindcss()],
    // Reuse public assets (favicons etc.) from the existing Lit UI
    publicDir: path.resolve(here, "../ui/public"),
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
    },
    server: {
      host: true,
      port: 5174,
      strictPort: true,
    },
  };
});
