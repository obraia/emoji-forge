import { decompressFrames, parseGIF } from 'gifuct-js';

export const MAX_STATIC_SIDE = 1024;
export const MAX_ANIM_SIDE = 480;
export const MAX_FRAMES = 300;

let counter = 0;
export const uid = () => `f${Date.now().toString(36)}${(counter++).toString(36)}`;

export interface DecodedFrame {
  bitmap: ImageBitmap;
  delay: number;
}

type Progress = (done: number, total: number) => void;

export function fitSize(w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

async function toBitmap(src: ImageBitmapSource, w: number, h: number, max: number) {
  const { w: rw, h: rh } = fitSize(w, h, max);
  return createImageBitmap(src, { resizeWidth: rw, resizeHeight: rh, resizeQuality: 'high' });
}

export function sanitizeName(raw: string) {
  let name = raw
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  if (name.length < 2) name = 'emoji';
  return name;
}

export const naturalSort = (a: File, b: File) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/** Carrega uma imagem estática (primeiro quadro, se animada). */
export async function loadImage(file: Blob, max = MAX_STATIC_SIDE): Promise<ImageBitmap> {
  let full: ImageBitmap;
  try {
    full = await createImageBitmap(file);
  } catch {
    // SVG e alguns formatos só decodificam via <img>
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      full = await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (Math.max(full.width, full.height) <= max) return full;
  const scaled = await toBitmap(full, full.width, full.height, max);
  full.close();
  return scaled;
}

const ANIMATED_TYPES = ['image/gif', 'image/webp', 'image/png', 'image/apng', 'image/avif'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ImageDecoderCtor: any = (globalThis as any).ImageDecoder;

/** Decodifica GIF / WebP animado / APNG em quadros já compostos. Retorna 1 quadro se não for animado. */
export async function decodeAnimated(file: File, onProgress?: Progress): Promise<DecodedFrame[]> {
  const type = file.type || (file.name.toLowerCase().endsWith('.gif') ? 'image/gif' : '');
  if (ImageDecoderCtor && ANIMATED_TYPES.includes(type) && (await ImageDecoderCtor.isTypeSupported(type))) {
    const decoder = new ImageDecoderCtor({ data: await file.arrayBuffer(), type });
    try {
      await decoder.tracks.ready;
      await decoder.completed;
      const track = decoder.tracks.selectedTrack ?? decoder.tracks[0];
      const count = Math.min(track?.frameCount ?? 1, MAX_FRAMES);
      const max = count > 1 ? MAX_ANIM_SIDE : MAX_STATIC_SIDE;
      const frames: DecodedFrame[] = [];
      for (let i = 0; i < count; i++) {
        const { image } = await decoder.decode({ frameIndex: i, completeFramesOnly: true });
        const delay = image.duration ? image.duration / 1000 : 100;
        frames.push({
          bitmap: await toBitmap(image, image.displayWidth, image.displayHeight, max),
          delay: delay < 20 ? 100 : delay,
        });
        image.close();
        onProgress?.(i + 1, count);
      }
      return frames;
    } finally {
      decoder.close();
    }
  }
  if (type === 'image/gif') return decodeGifFallback(file, onProgress);
  return [{ bitmap: await loadImage(file, MAX_STATIC_SIDE), delay: 100 }];
}

/** Fallback (navegadores sem WebCodecs ImageDecoder): compõe os patches do GIF manualmente. */
async function decodeGifFallback(file: File, onProgress?: Progress): Promise<DecodedFrame[]> {
  const gif = parseGIF(await file.arrayBuffer());
  const raw = decompressFrames(gif, true).slice(0, MAX_FRAMES);
  const { width: W, height: H } = gif.lsd;
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const patchCanvas = new OffscreenCanvas(1, 1);
  const pctx = patchCanvas.getContext('2d')!;
  const frames: DecodedFrame[] = [];

  for (let i = 0; i < raw.length; i++) {
    const f = raw[i];
    const { width, height, left, top } = f.dims;
    const saved = f.disposalType === 3 ? ctx.getImageData(0, 0, W, H) : null;
    patchCanvas.width = width;
    patchCanvas.height = height;
    pctx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), width, height), 0, 0);
    ctx.drawImage(patchCanvas, left, top);
    frames.push({ bitmap: await toBitmap(canvas, W, H, MAX_ANIM_SIDE), delay: f.delay < 20 ? 100 : f.delay });
    if (f.disposalType === 2) ctx.clearRect(left, top, width, height);
    else if (saved) ctx.putImageData(saved, 0, 0);
    onProgress?.(i + 1, raw.length);
  }
  return frames;
}

/** Carrega uma sequência de imagens (ordenadas por nome). */
export async function loadSequence(files: File[], onProgress?: Progress): Promise<DecodedFrame[]> {
  const sorted = [...files].sort(naturalSort).slice(0, MAX_FRAMES);
  const frames: DecodedFrame[] = [];
  for (let i = 0; i < sorted.length; i++) {
    frames.push({ bitmap: await loadImage(sorted[i], MAX_ANIM_SIDE), delay: 100 });
    onProgress?.(i + 1, sorted.length);
  }
  return frames;
}

/** Busca o tempo e espera o quadro correspondente ser de fato apresentado. */
function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const hasRvfc = 'requestVideoFrameCallback' in video;
    let seeked = false;
    let presented = false;
    let timer = 0;
    const finish = () => {
      clearTimeout(timer);
      cleanup();
      resolve();
    };
    if (hasRvfc) {
      video.requestVideoFrameCallback(() => {
        presented = true;
        if (seeked) finish();
      });
    }
    const onSeeked = () => {
      seeked = true;
      // Sem rVFC (ou se o quadro não mudar) seguimos após um pequeno intervalo
      if (!hasRvfc || presented) finish();
      else timer = window.setTimeout(finish, 250);
    };
    const onError = () => {
      cleanup();
      reject(new Error('error.videoSeek'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

export interface VideoExtractOptions {
  start: number;
  end: number;
  fps: number;
}

export async function extractVideoFrames(
  video: HTMLVideoElement,
  { start, end, fps }: VideoExtractOptions,
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<DecodedFrame[]> {
  video.pause();
  await new Promise((r) => setTimeout(r, 50));
  const step = 1 / fps;
  const times: number[] = [];
  for (let t = start; t < end - 1e-4 && times.length < MAX_FRAMES; t += step) times.push(t);
  if (times.length === 0) times.push(start);

  const frames: DecodedFrame[] = [];
  const delay = Math.round(1000 / fps);
  for (let i = 0; i < times.length; i++) {
    if (signal?.aborted) {
      frames.forEach((f) => f.bitmap.close());
      throw new DOMException('Aborted', 'AbortError');
    }
    await seek(video, times[i]);
    frames.push({ bitmap: await toBitmap(video, video.videoWidth, video.videoHeight, MAX_ANIM_SIDE), delay });
    onProgress?.(i + 1, times.length);
  }
  return frames;
}

export const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|m4v|ogv)$/i.test(f.name);
export const isImage = (f: File) =>
  f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|bmp|svg|apng)$/i.test(f.name);
