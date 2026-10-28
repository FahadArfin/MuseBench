import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], base: './', server: { host: '127.0.0.1', port: 4318, strictPort: true, watch: { ignored: ['**/artifacts/**', '**/release/**', '**/.musebench/**'] } }, build: { outDir: 'dist', assetsInlineLimit: file => /\.woff2$/i.test(file) ? false : undefined } });
