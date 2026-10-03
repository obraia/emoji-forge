/// <reference lib="webworker" />
import { AutoModel, AutoProcessor, env, RawImage, type Tensor } from '@huggingface/transformers';
import { BG_MODELS, type BgModel } from '../lib/models';

export type BgRequest =
  | { type: 'load'; model: string; device: 'auto' | 'webgpu' | 'wasm' }
  | { type: 'run'; id: number; data: ArrayBuffer; width: number; height: number };

export type BgResponse =
  | { type: 'progress'; loaded: number; total: number; file?: string }
  | { type: 'ready'; device: 'webgpu' | 'wasm'; model: string }
  | { type: 'result'; id: number; data: ArrayBuffer; width: number; height: number }
  | { type: 'error'; id?: number; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
env.allowLocalModels = false;
// O Hugging Face responde 404 sem CORS quando o Referer é um `*.workers.dev`. O `_headers` já define
// `Referrer-Policy: same-origin`, mas um worker em cache pode ter vindo com os cabeçalhos antigos — então o
// download dos modelos nunca envia Referer, independentemente de onde o app estiver hospedado.
env.fetch = (input, init) => fetch(input, { ...init, referrerPolicy: 'no-referrer' });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = any;
let model: AnyModel = null;
let processor: AnyModel = null;
let loaded = { key: '', device: 'wasm' as 'webgpu' | 'wasm' };

const post = (msg: BgResponse, transfer: Transferable[] = []) => scope.postMessage(msg, transfer);

async function gpuInfo() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = await (navigator as any).gpu?.requestAdapter();
    return adapter ? { ok: true, f16: adapter.features.has('shader-f16') as boolean } : { ok: false, f16: false };
  } catch {
    return { ok: false, f16: false };
  }
}

/** Executa o modelo e devolve a imagem RGBA com o fundo removido. */
async function infer(src: Uint8ClampedArray, width: number, height: number) {
  const image = new RawImage(src, width, height, 4).rgb();
  const { pixel_values } = await processor(image);
  const session = model.sessions.model;
  const out = await model({ [session.inputNames[0]]: pixel_values });
  const item: Tensor = out[session.outputNames[0]][0];
  // Alguns modelos devolvem logits; outros já aplicam sigmoid
  if ((item.data as Float32Array).some((x) => x < -1e-5 || x > 1 + 1e-5)) item.sigmoid_();
  const mask = await RawImage.fromTensor(item.mul_(255).to('uint8')).resize(width, height);
  const rgba = new Uint8ClampedArray(src);
  const m = mask.data;
  for (let i = 0, p = 3; i < m.length; i++, p += 4) rgba[p] = (m[i] * src[p]) / 255;
  return rgba;
}

async function load(spec: BgModel, wanted: 'auto' | 'webgpu' | 'wasm') {
  const gpu = await gpuInfo();
  const devices: ('webgpu' | 'wasm')[] = spec.webgpu && wanted !== 'wasm' && gpu.ok ? ['webgpu', 'wasm'] : ['wasm'];

  let lastErr: unknown;
  for (const device of devices) {
    const key = `${spec.id}|${device}`;
    if (model && loaded.key === key) return device;
    const dtype = device === 'webgpu' ? (spec.webgpu === 'fp16' && !gpu.f16 ? 'fp32' : spec.webgpu!) : spec.wasm;
    try {
      await model?.dispose?.();
      model = null;
      const files = new Map<string, { loaded: number; total: number }>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const progress_callback = (p: any) => {
        if (p.status !== 'progress' || !p.file) return;
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
        let l = 0;
        let t = 0;
        files.forEach((f) => {
          l += f.loaded;
          t += f.total;
        });
        post({ type: 'progress', loaded: l, total: t, file: p.file });
      };
      processor = await AutoProcessor.from_pretrained(spec.id, { progress_callback });
      model = await AutoModel.from_pretrained(spec.id, {
        device,
        dtype,
        config: { model_type: 'custom' } as never,
        progress_callback,
      });
      // Aquecimento: valida que o backend realmente executa este modelo (senão cai para WASM)
      await infer(new Uint8ClampedArray(64 * 64 * 4).fill(255), 64, 64);
      loaded = { key, device };
      return device;
    } catch (err) {
      console.warn(`[bg] falha com ${device}/${dtype}`, err);
      lastErr = err;
      model = null;
    }
  }
  throw lastErr;
}

scope.onmessage = async (e: MessageEvent<BgRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      const spec = BG_MODELS.find((m) => m.id === msg.model) ?? BG_MODELS[0];
      const device = await load(spec, msg.device);
      post({ type: 'ready', device, model: spec.id });
    } else if (msg.type === 'run') {
      if (!model) throw new Error('error.modelNotLoaded');
      const rgba = await infer(new Uint8ClampedArray(msg.data), msg.width, msg.height);
      post({ type: 'result', id: msg.id, data: rgba.buffer, width: msg.width, height: msg.height }, [rgba.buffer]);
    }
  } catch (err) {
    post({ type: 'error', id: msg.type === 'run' ? msg.id : undefined, error: String((err as Error)?.message ?? err) });
  }
};
