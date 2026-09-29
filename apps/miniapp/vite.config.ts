import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Предзагрузка основного начертания (Onest 400, кириллица и латиница): шрифт качается вместе с JS, а не после
 * разбора CSS, — к первому экрану он уже есть, и текст не прыгает при подмене. Имена файлов с хешем знает только
 * сборка, поэтому ссылки вставляет плагин.
 */
function preloadFonts(patterns: RegExp[]): Plugin {
  return {
    name: 'tandem-preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((file) => patterns.some((p) => p.test(file)));
        return files.map((file) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), preloadFonts([/onest-cyrillic-400-normal-[\w-]+\.woff2$/, /onest-latin-400-normal-[\w-]+\.woff2$/])],
  server: {
    port: 5173,
    // API — на сервере Андрея (apps/server), в проде на том же домене
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: 'dist',
    rolldownOptions: {
      output: {
        // Библиотека движения — своим чанком: её грузят экраны ролей, первому экрану она не нужна.
        // Без includeDependenciesRecursively в этот чанк уехал бы и React, и первый экран грузил бы его целиком
        codeSplitting: { includeDependenciesRecursively: false, groups: [{ name: 'motion', test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/ }] },
      },
    },
  },
});
