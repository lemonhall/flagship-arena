import { defineConfig } from 'vite';
export default defineConfig({
  // Relative base so the same build works when served from a sub-path
  // (itch.io HTML5 iframe serves the game from https://html.itch.zone/html/<id>/).
  base: './',
  build: { rollupOptions: { output: { manualChunks: { three: ['three', 'three/addons/loaders/GLTFLoader.js', 'three/addons/libs/meshopt_decoder.module.js'] } } } },
});
