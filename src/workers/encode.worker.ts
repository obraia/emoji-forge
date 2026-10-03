/// <reference lib="webworker" />
import { GIFEncoder, applyPalette, quantize, type Palette } from 'gifenc';
import { LIMIT_BYTES, MATTE_COLORS, type EncodeResult, type Matte, type OutputMode } from '../lib/types';

export interface EncodeRequest {
  id: number;
  mode: OutputMode;
  size: number;
  frames: { data: ArrayBuffer; delay: number }[];
  auto: boolean;
  colors: number;
  tolerance: number;
  frameStep: number;
  alphaThreshold: number;
  matte: Matte;
}

export type EncodeResponse = { id: number; ok: true; result: EncodeResult } | { id: number; ok: false; error: string };

interface Attempt {
  size: number;
  colors: number;
  tolerance: number;
  frameStep: number;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (e: MessageEvent<EncodeRequest>) => {
  const req = e.data;
  try {
    const result = req.mode === 'static' ? await encodeStatic(req) : encodeAnimated(req);
    scope.postMessage({ id: req.id, ok: true, result } satisfies EncodeResponse);
  } catch (err) {
    scope.postMessage({
      id: req.id,
      ok: false,
      error: String((err as Error)?.message ?? err),
    } satisfies EncodeResponse);
  }
};

// ---------- utilitários ----------

function makeResizer(req: EncodeRequest) {
  const base = req.size;
  const cache = new Map<number, Uint8ClampedArray[]>();
  cache.set(
    base,
    req.frames.map((f) => new Uint8ClampedArray(f.data)),
  );
  return (size: number): Uint8ClampedArray[] => {
    const hit = cache.get(size);
    if (hit) return hit;
    const src = new OffscreenCanvas(base, base);
    const sctx = src.getContext('2d')!;
    const dst = new OffscreenCanvas(size, size);
    const dctx = dst.getContext('2d', { willReadFrequently: true })!;
    dctx.imageSmoothingQuality = 'high';
    const out = cache.get(base)!.map((data) => {
      sctx.putImageData(new ImageData(new Uint8ClampedArray(data), base, base), 0, 0);
      dctx.clearRect(0, 0, size, size);
      dctx.drawImage(src, 0, 0, size, size);
      return dctx.getImageData(0, 0, size, size).data;
    });
    cache.set(size, out);
    return out;
  };
}

function sizeLadder(n: number, fractions: number[]) {
  const out: number[] = [];
  for (const f of fractions) {
    const s = Math.max(32, Math.round((n * f) / 8) * 8);
    if (s <= n && !out.includes(s)) out.push(s);
  }
  return out;
}

// ---------- estático (PNG) ----------

async function encodePng(data: Uint8ClampedArray, size: number) {
  const c = new OffscreenCanvas(size, size);
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), size, size), 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}

async function encodeStatic(req: EncodeRequest): Promise<EncodeResult> {
  const resize = makeResizer(req);
  const sizes = req.auto ? sizeLadder(req.size, [1, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25]) : [req.size];
  let blob: Blob | null = null;
  let size = req.size;
  for (size of sizes) {
    blob = await encodePng(resize(size)[0], size);
    if (blob.size <= LIMIT_BYTES) break;
  }
  return {
    blob: blob!,
    bytes: blob!.size,
    size,
    colors: 0,
    frameStep: 1,
    tolerance: 0,
    frames: 1,
    overLimit: blob!.size > LIMIT_BYTES,
    mime: 'image/png',
  };
}

// ---------- animado (GIF) ----------

/** GIF só tem transparência de 1 bit: aplica limiar de alpha e, opcionalmente, mescla bordas com a cor do tema. */
function binarizeAlpha(src: Uint8ClampedArray, threshold: number, matte: Matte) {
  const out = new Uint8ClampedArray(src.length);
  const m = matte === 'none' ? null : MATTE_COLORS[matte];
  for (let p = 0; p < src.length; p += 4) {
    const a = src[p + 3];
    if (a < threshold) continue; // fica 0,0,0,0
    if (m && a < 255) {
      const k = a / 255;
      out[p] = src[p] * k + m[0] * (1 - k);
      out[p + 1] = src[p + 1] * k + m[1] * (1 - k);
      out[p + 2] = src[p + 2] * k + m[2] * (1 - k);
    } else {
      out[p] = src[p];
      out[p + 1] = src[p + 1];
      out[p + 2] = src[p + 2];
    }
    out[p + 3] = 255;
  }
  return out;
}

function encodeGif(frames: Uint8ClampedArray[], delays: number[], w: number, colors: number, tolerance: number) {
  const n = frames.length;
  const px = w * w;

  // Paleta global a partir de uma amostra dos pixels opacos de todos os quadros
  const maxSamples = 180_000;
  let stride = Math.max(1, Math.floor((n * px) / maxSamples));
  if (stride > 1 && stride % 2 === 0) stride++;
  const sample = new Uint8Array(Math.ceil((n * px) / stride) * 4 + 4);
  let count = 0;
  for (let g = 0; g < n * px; g += stride) {
    const f = frames[(g / px) | 0];
    const p = (g % px) * 4;
    if (f[p + 3] === 0) continue;
    sample[count * 4] = f[p];
    sample[count * 4 + 1] = f[p + 1];
    sample[count * 4 + 2] = f[p + 2];
    sample[count * 4 + 3] = 255;
    count++;
  }
  // Um índice fica reservado para transparência (fundo transparente e otimização entre quadros)
  const palette: Palette = count > 0 ? quantize(sample.subarray(0, count * 4), Math.max(2, colors - 1)) : [[0, 0, 0]];
  const tIndex = palette.length;
  const fullPalette = [...palette, [0, 0, 0]];
  const pr = palette.map((c) => c[0]);
  const pg = palette.map((c) => c[1]);
  const pb = palette.map((c) => c[2]);
  const tol2 = tolerance * tolerance;

  // Descarte (disposal): 1 = mantém o quadro anterior e grava só a diferença;
  // 2 = limpa (necessário quando algum pixel opaco vira transparente no próximo quadro).
  const dispose = new Uint8Array(n).fill(2);
  for (let i = 0; i < n - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    let keep = true;
    for (let p = 3; p < a.length; p += 4) {
      if (a[p] !== 0 && b[p] === 0) {
        keep = false;
        break;
      }
    }
    dispose[i] = keep ? 1 : 2;
  }

  const composite = new Int16Array(px).fill(-1);
  const out: { index: Uint8Array; delay: number; dispose: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0 && dispose[i - 1] === 2) composite.fill(-1);
    const f = frames[i];
    const idx = applyPalette(f, palette);
    const index = new Uint8Array(px);
    let changed = false;
    for (let j = 0; j < px; j++) {
      if (f[j * 4 + 3] === 0) {
        index[j] = tIndex;
        continue;
      }
      const c = idx[j];
      const prev = composite[j];
      if (prev >= 0) {
        if (prev === c) {
          index[j] = tIndex;
          continue;
        }
        if (tol2 > 0) {
          const dr = pr[c] - pr[prev];
          const dg = pg[c] - pg[prev];
          const db = pb[c] - pb[prev];
          if (dr * dr + dg * dg + db * db <= tol2) {
            index[j] = tIndex;
            continue;
          }
        }
      }
      index[j] = c;
      composite[j] = c;
      changed = true;
    }
    const disp = i < n - 1 ? dispose[i] : 2;
    if (!changed && out.length > 0 && dispose[i - 1] === 1) {
      // Quadro idêntico ao anterior: só soma a duração
      const last = out[out.length - 1];
      last.delay += delays[i];
      last.dispose = disp;
      continue;
    }
    out.push({ index, delay: delays[i], dispose: disp });
  }

  const enc = GIFEncoder();
  out.forEach((f, i) => {
    enc.writeFrame(f.index, w, w, {
      palette: i === 0 ? fullPalette : undefined,
      delay: Math.max(20, Math.round(f.delay / 10) * 10),
      transparent: true,
      transparentIndex: tIndex,
      dispose: f.dispose,
      repeat: 0,
    });
  });
  enc.finish();
  return { bytes: enc.bytes(), frames: out.length };
}

function dropFrames(frames: Uint8ClampedArray[], delays: number[], step: number) {
  if (step <= 1) return { frames, delays };
  const f: Uint8ClampedArray[] = [];
  const d: number[] = [];
  for (let i = 0; i < frames.length; i += step) {
    f.push(frames[i]);
    let sum = 0;
    for (let j = i; j < Math.min(i + step, frames.length); j++) sum += delays[j];
    d.push(sum);
  }
  return { frames: f, delays: d };
}

function animatedLadder(n: number, req: EncodeRequest): Attempt[] {
  const [s0, s1, s2, s3, s4] = sizeLadder(n, [1, 0.875, 0.75, 0.625, 0.5]).concat([n, n, n, n, n]);
  const list: Attempt[] = [
    { size: s0, colors: 256, tolerance: 0, frameStep: 1 },
    { size: s0, colors: 192, tolerance: 3, frameStep: 1 },
    { size: s0, colors: 128, tolerance: 6, frameStep: 1 },
    { size: s1, colors: 128, tolerance: 6, frameStep: 1 },
    { size: s1, colors: 96, tolerance: 10, frameStep: 1 },
    { size: s2, colors: 96, tolerance: 10, frameStep: 1 },
    { size: s2, colors: 64, tolerance: 14, frameStep: 1 },
    { size: s2, colors: 64, tolerance: 14, frameStep: 2 },
    { size: s3, colors: 64, tolerance: 14, frameStep: 2 },
    { size: s3, colors: 48, tolerance: 18, frameStep: 2 },
    { size: s4, colors: 48, tolerance: 18, frameStep: 2 },
    { size: s4, colors: 32, tolerance: 22, frameStep: 3 },
    { size: 40, colors: 32, tolerance: 24, frameStep: 3 },
    { size: 32, colors: 32, tolerance: 28, frameStep: 4 },
  ];
  const frameCount = req.frames.length;
  const seen = new Set<string>();
  return list
    .map((a) => ({ ...a, size: Math.min(a.size, n), frameStep: Math.min(a.frameStep, Math.max(1, frameCount)) }))
    .filter((a) => {
      const k = `${a.size}-${a.colors}-${a.tolerance}-${a.frameStep}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function encodeAnimated(req: EncodeRequest): EncodeResult {
  const resize = makeResizer(req);
  const delays = req.frames.map((f) => f.delay);
  const binarized = new Map<number, Uint8ClampedArray[]>();
  const framesAt = (size: number) => {
    let b = binarized.get(size);
    if (!b) {
      b = resize(size).map((d) => binarizeAlpha(d, req.alphaThreshold, req.matte));
      binarized.set(size, b);
    }
    return b;
  };

  const attempts: Attempt[] = req.auto
    ? animatedLadder(req.size, req)
    : [{ size: req.size, colors: req.colors, tolerance: req.tolerance, frameStep: req.frameStep }];

  let best: { a: Attempt; bytes: Uint8Array; frames: number } | null = null;
  for (const a of attempts) {
    const { frames, delays: d } = dropFrames(framesAt(a.size), delays, a.frameStep);
    const res = encodeGif(frames, d, a.size, a.colors, a.tolerance);
    if (!best || res.bytes.length < best.bytes.length) best = { a, ...res };
    if (res.bytes.length <= LIMIT_BYTES) {
      best = { a, ...res };
      break;
    }
  }
  const { a, bytes, frames } = best!;
  return {
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/gif' }),
    bytes: bytes.length,
    size: a.size,
    colors: a.colors,
    frameStep: a.frameStep,
    tolerance: a.tolerance,
    frames,
    overLimit: bytes.length > LIMIT_BYTES,
    mime: 'image/gif',
  };
}
