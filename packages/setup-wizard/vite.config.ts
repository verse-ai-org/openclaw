import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
      include: ['src'],
      exclude: ['src/examples/**', 'src/pages/**', 'src/**/*.stories.*', 'src/**/*.test.*'],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'SetupWizard',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      // 外部化所有依赖，不打包进 lib
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'zustand',
        'lucide-react',
        'clsx',
        'tailwind-merge',
        'class-variance-authority',
        'vaul',
        'radix-ui',
        /^@radix-ui\/.*/,
        /^@assistant-ui\/.*/,
      ],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
        // 保留模块结构
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
