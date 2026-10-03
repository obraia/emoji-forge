import type { EncodeRequest, EncodeResponse } from '../workers/encode.worker';
import type { EncodeResult } from './types';

type Job = { req: Omit<EncodeRequest, 'id'>; resolve: (r: EncodeResult) => void; reject: (e: Error) => void };

export class Superseded extends Error {}

/** Mantém no máximo um job em andamento e um na fila (o mais recente vence). */
class EncoderClient {
  private worker = new Worker(new URL('../workers/encode.worker.ts', import.meta.url), { type: 'module' });
  private running: (Job & { id: number }) | null = null;
  private queued: Job | null = null;
  private nextId = 1;

  constructor() {
    this.worker.onmessage = (e: MessageEvent<EncodeResponse>) => {
      const job = this.running;
      this.running = null;
      if (job && job.id === e.data.id) {
        if (e.data.ok) job.resolve(e.data.result);
        else job.reject(new Error(e.data.error));
      }
      this.pump();
    };
  }

  encode(req: Omit<EncodeRequest, 'id'>): Promise<EncodeResult> {
    return new Promise((resolve, reject) => {
      this.queued?.reject(new Superseded());
      this.queued = { req, resolve, reject };
      this.pump();
    });
  }

  private pump() {
    if (this.running || !this.queued) return;
    const job = { ...this.queued, id: this.nextId++ };
    this.queued = null;
    this.running = job;
    this.worker.postMessage(
      { ...job.req, id: job.id },
      job.req.frames.map((f) => f.data),
    );
  }
}

let client: EncoderClient | null = null;
export const encoder = () => (client ??= new EncoderClient());
