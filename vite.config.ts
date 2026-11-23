import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

/**
 * Basis der Website. Auf GitHub Pages liegt sie unter
 * https://peterheliko.github.io/musiktheorie/ — mit eigener Domain später
 * einfach `BASE_PATH=/ npm run build`.
 *
 * Absolut statt './' wie im Vorgängerprojekt: die Seiten liegen in
 * verschiedenen Tiefen (/ueben/intervalle-hoeren/), und ein relativer Pfad zu
 * assets/ wäre auf jeder Ebene ein anderer.
 */
const base = process.env.BASE_PATH ?? '/musiktheorie/';

export default defineConfig({
  base,
  plugins: [preact()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Die Klaviersamples dürfen nicht als Base64 in den Code wandern.
    assetsInlineLimit: 0,
    target: 'es2020',
    rollupOptions: {
      output: {
        // Keine Hashes: erleichtert das Diffen zweier Fassungen.
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
