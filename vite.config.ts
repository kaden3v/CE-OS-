import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', '@tanstack/react-table'],
    },
    build: {
      rollupOptions: {
        output: {
          // Split large, rarely-changing vendor code into long-lived chunks so
          // app-code edits don't bust the cache for the whole framework payload.
          // recharts (the 328kB shared chart bundle) and framer-motion get their
          // own named chunks instead of being re-hashed on every finance change.
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-charts': ['recharts'],
            'vendor-motion': ['framer-motion'],
            'vendor-table': ['@tanstack/react-table'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
