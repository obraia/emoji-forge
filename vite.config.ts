import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// COOP/COEP habilitam SharedArrayBuffer → WASM multi-thread no onnxruntime (remoção de fundo mais rápida).
// Em produção os mesmos cabeçalhos vêm de `public/_headers`.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

/**
 * O onnxruntime-web referencia o próprio `.wasm` (~27 MB) via `new URL(..., import.meta.url)`, e o Vite o copia
 * para o build. Mas o transformers.js aponta `wasmPaths` para o jsDelivr antes de criar qualquer sessão, então essa
 * cópia nunca é baixada — e passa do limite de 25 MiB por arquivo do Cloudflare Workers. Descartamos ela.
 */
function dropOrtWasm(): Plugin {
  return {
    name: 'drop-ort-wasm',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const file of Object.keys(bundle)) {
        if (/ort-wasm.*\.wasm$/.test(file)) delete bundle[file];
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), dropOrtWasm()],
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: 'es', plugins: () => [dropOrtWasm()] },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
});
