import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // The local rehearsal serves argument content from its own in-memory pin service, which
    // answers without CORS headers - a browser refuses it, and every argument reads as its
    // digest. Proxying the gateway path through the dev server puts it on this origin, so a
    // run against anvil is as readable as one against the shared testnet.
    proxy: {
      '/ipfs': { target: process.env.VITE_IPFS_PROXY_TARGET ?? 'http://127.0.0.1:5599', changeOrigin: true },
    },
  },
});
