export interface BgModel {
  id: string;
  label: string;
  /** Prefixo das chaves de tradução (model.<key>.desc / .size / .license). */
  key: 'rmbg' | 'modnet';
  /** dtype no WebGPU, ou null se o modelo não roda corretamente nele. */
  webgpu: 'fp16' | 'fp32' | null;
  wasm: 'q8' | 'fp32';
}

export const BG_MODELS: BgModel[] = [
  {
    id: 'briaai/RMBG-1.4',
    label: 'RMBG 1.4',
    key: 'rmbg',
    webgpu: 'fp16',
    wasm: 'q8',
  },
  {
    id: 'Xenova/modnet',
    label: 'MODNet',
    key: 'modnet',
    // O MODNet gera máscaras incorretas no backend WebGPU do onnxruntime; em WASM é rápido o suficiente.
    webgpu: null,
    wasm: 'fp32',
  },
];
