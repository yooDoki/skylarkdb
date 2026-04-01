import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(async ({ mode }) => ({
  plugins: [
    react(),
    mode === 'analyze' && visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-codemirror': [
            'codemirror',
            '@codemirror/autocomplete',
            '@codemirror/commands',
            '@codemirror/lang-sql',
            '@codemirror/state',
            '@codemirror/theme-one-dark',
            '@codemirror/view',
            '@uiw/react-codemirror',
          ],
          'vendor-radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
          ],
          'vendor-lucide': ['lucide-react'],
          'vendor-tauri': ['@tauri-apps/api', '@tauri-apps/plugin-shell', '@tauri-apps/plugin-updater'],
          'vendor-utils': ['zustand', 'clsx', 'tailwind-merge', 'class-variance-authority'],
        },
      },
    },
  },
}));
