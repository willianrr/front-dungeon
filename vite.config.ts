import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    allowedHosts: ['.loca.lt', '.trycloudflare.com'],
  },
  preview: {
    allowedHosts: ['.loca.lt', '.trycloudflare.com'],
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});
