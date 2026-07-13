import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/Lyra-music-player/' : '/',
  server: { port: 5175, open: false },
  build: { outDir: 'dist', sourcemap: false, target: 'es2020' },
}));
