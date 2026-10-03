import type { BgRequest, BgResponse } from '../workers/bg.worker';

export type Device = 'webgpu' | 'wasm';

class BgRemover {
  private worker = new Worker(new URL('../workers/bg.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private runs = new Map<number, { resolve: (d: ImageData) => void; reject: (e: Error) => void }>();
  private loading: {
    resolve: (d: Device) => void;
    reject: (e: Error) => void;
    onProgress?: (p: number) => void;
  } | null = null;

  constructor() {
    this.worker.onmessage = (e: MessageEvent<BgResponse>) => {
      const m = e.data;
      if (m.type === 'progress') {
        this.loading?.onProgress?.(m.total > 0 ? m.loaded / m.total : 0);
      } else if (m.type === 'ready') {
        this.loading?.resolve(m.device);
        this.loading = null;
      } else if (m.type === 'result') {
        const run = this.runs.get(m.id);
        this.runs.delete(m.id);
        run?.resolve(new ImageData(new Uint8ClampedArray(m.data), m.width, m.height));
      } else if (m.type === 'error') {
        const err = new Error(m.error);
        if (m.id !== undefined) {
          this.runs.get(m.id)?.reject(err);
          this.runs.delete(m.id);
        } else {
          this.loading?.reject(err);
          this.loading = null;
        }
      }
    };
  }

  load(model: string, device: 'auto' | Device, onProgress?: (p: number) => void): Promise<Device> {
    return new Promise((resolve, reject) => {
      this.loading = { resolve, reject, onProgress };
      this.worker.postMessage({ type: 'load', model, device } satisfies BgRequest);
    });
  }

  run(img: ImageData): Promise<ImageData> {
    const id = this.nextId++;
    const buf = new Uint8ClampedArray(img.data).buffer;
    return new Promise((resolve, reject) => {
      this.runs.set(id, { resolve, reject });
      this.worker.postMessage(
        { type: 'run', id, data: buf, width: img.width, height: img.height } satisfies BgRequest,
        [buf],
      );
    });
  }
}

let instance: BgRemover | null = null;
export const bgRemover = () => (instance ??= new BgRemover());

export const webgpuSupported = () => typeof navigator !== 'undefined' && 'gpu' in navigator;
