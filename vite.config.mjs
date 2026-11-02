import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {filePreviewPlugin} from './scripts/file-preview-server.mjs';
export default defineConfig({ plugins: [react(),filePreviewPlugin()], base: './', server: { host: '127.0.0.1', port: 4318, strictPort: true, watch: { ignored: ['**/artifacts/**', '**/release/**', '**/.musebench/**'] } }, build: { outDir: 'dist', assetsInlineLimit: file => /\.woff2$/i.test(file) ? false : undefined } });
