import { createConfig } from '@warp-drive/internal-config/vite/config.js';

export const externals = ['@sqlite.org/sqlite-wasm', '@embroider/macros'];

export const entryPoints = [
  './src/document-storage.ts',
  './src/data-worker.ts',
  './src/worker-fetch.ts',
  './src/image-worker.ts',
  './src/image-fetch.ts',
];

export default createConfig(
  {
    entryPoints,
    externals,
  },
  import.meta.resolve
);
