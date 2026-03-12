import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  // file:// 协议加载时资源路径必须是相对路径
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // 每个入口页面生成独立 HTML
    rollupOptions: {
      input: {
        onboarding: resolve(__dirname, "onboarding.html"),
      },
    },
  },
});
