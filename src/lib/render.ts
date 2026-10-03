import type { ChromaSettings, Frame, Transform } from './types';

type Drawable = CanvasImageSource & { width: number; height: number };
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const DEFAULT_TRANSFORM: Transform = { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipH: false };

/** Escala base: imagem inteira cabe no recorte ("ajustar"). */
export function baseScale(img: { width: number; height: number }, t: Transform, crop: number) {
  const swap = t.rotation % 180 !== 0;
  const iw = swap ? img.height : img.width;
  const ih = swap ? img.width : img.height;
  return crop / Math.max(iw, ih);
}

/** Zoom necessário para a imagem cobrir todo o recorte ("preencher"). */
export function coverZoom(img: { width: number; height: number }, t: Transform) {
  const swap = t.rotation % 180 !== 0;
  const iw = swap ? img.height : img.width;
  const ih = swap ? img.width : img.height;
  return Math.max(iw, ih) / Math.min(iw, ih);
}

export function drawTransformed(ctx: Ctx2D, img: Drawable, t: Transform, cropX: number, cropY: number, crop: number) {
  const s = baseScale(img, t, crop) * t.zoom;
  ctx.save();
  ctx.translate(cropX + crop / 2 + t.offsetX * crop, cropY + crop / 2 + t.offsetY * crop);
  if (t.flipH) ctx.scale(-1, 1);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(s, s);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

export function bitmapToImageData(img: Drawable): ImageData {
  const c = new OffscreenCanvas(img.width, img.height);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

export function sampleCornerColor(img: Drawable): [number, number, number] {
  const { data, width: w, height: h } = bitmapToImageData(img);
  const pts = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [w >> 1, 0],
    [0, h >> 1],
    [w - 1, h >> 1],
    [w >> 1, h - 1],
  ];
  // Mediana por canal: robusta a um canto "sujo"
  const ch = [0, 1, 2].map(
    (c) => pts.map(([x, y]) => data[(y * w + x) * 4 + c]).sort((a, b) => a - b)[pts.length >> 1],
  );
  return ch as [number, number, number];
}

/** Chroma key / varinha mágica, aplicado in-place. */
export function applyChroma(img: ImageData, s: ChromaSettings) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const [kr, kg, kb] = s.color;
  const tol = s.tolerance * 4.42; // 0–100 → 0–442 (distância RGB máxima)
  const soft = Math.max(1, s.softness * 4.42);
  const dist = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const dr = data[p] - kr;
    const dg = data[p + 1] - kg;
    const db = data[p + 2] - kb;
    dist[i] = Math.sqrt(dr * dr + dg * dg + db * db);
  }

  let mask: Uint8Array | null = null;
  if (s.contiguous) {
    // Flood fill a partir das bordas, só por pixels "parecidos"
    mask = new Uint8Array(n);
    const stack = new Int32Array(n);
    let sp = 0;
    const limit = tol + soft;
    const push = (i: number) => {
      if (!mask![i] && dist[i] <= limit) {
        mask![i] = 1;
        stack[sp++] = i;
      }
    };
    for (let x = 0; x < w; x++) {
      push(x);
      push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      push(y * w);
      push(y * w + w - 1);
    }
    while (sp > 0) {
      const i = stack[--sp];
      const x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < n - w) push(i + w);
    }
  }

  for (let i = 0, p = 3; i < n; i++, p += 4) {
    if (mask && !mask[i]) continue;
    const d = dist[i];
    if (d <= tol) data[p] = 0;
    else if (d < tol + soft) data[p] = Math.round(data[p] * ((d - tol) / soft));
  }
}

const processedCache = new WeakMap<ImageBitmap, { key: string; canvas: OffscreenCanvas }>();

/** Imagem-fonte do quadro com IA (cutout) + chroma key aplicados, em cache. */
export function processedSource(frame: Frame, chroma: ChromaSettings): Drawable {
  const base = frame.cutout ?? frame.source;
  if (!chroma.enabled) return base;
  const key = `${chroma.color.join(',')}|${chroma.tolerance}|${chroma.softness}|${chroma.contiguous}`;
  const hit = processedCache.get(base);
  if (hit && hit.key === key) return hit.canvas;
  const data = bitmapToImageData(base);
  applyChroma(data, chroma);
  const canvas = hit?.canvas ?? new OffscreenCanvas(base.width, base.height);
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  processedCache.set(base, { key, canvas });
  return canvas;
}

/** Renderiza os quadros finais no tamanho do emoji. */
export function renderFrames(frames: Frame[], t: Transform, size: number, chroma: ChromaSettings): ImageData[] {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return frames.map((f) => {
    ctx.clearRect(0, 0, size, size);
    drawTransformed(ctx, processedSource(f, chroma), t, 0, 0, size);
    return ctx.getImageData(0, 0, size, size);
  });
}
