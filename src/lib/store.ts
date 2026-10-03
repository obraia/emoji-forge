import { create } from 'zustand';
import { uid, type DecodedFrame } from './importers';
import { DEFAULT_TRANSFORM } from './render';
import type { ChromaSettings, ExportSettings, Frame, SourceKind, Transform } from './types';

interface State {
  frames: Frame[];
  kind: SourceKind | null;
  current: number;
  playing: boolean;
  name: string;
  transform: Transform;
  exportSettings: ExportSettings;
  chroma: ChromaSettings;
  /** Conta-gotas do chroma key ativo. */
  picking: boolean;
  /** Processamento pesado em andamento (pausa a codificação ao vivo). */
  busy: boolean;

  load: (frames: DecodedFrame[], kind: SourceKind, name: string) => void;
  append: (frames: DecodedFrame[]) => void;
  clear: () => void;
  removeFrame: (index: number) => void;
  duplicateFrame: (index: number) => void;
  moveFrame: (from: number, to: number) => void;
  setFrameDelay: (index: number, delay: number) => void;
  setAllDelays: (delay: number) => void;
  setCutouts: (cutouts: Map<string, ImageBitmap>) => void;
  clearCutouts: (ids?: string[]) => void;
  setCurrent: (i: number) => void;
  setPlaying: (p: boolean) => void;
  setName: (n: string) => void;
  setTransform: (t: Partial<Transform>) => void;
  resetTransform: () => void;
  setExport: (s: Partial<ExportSettings>) => void;
  setChroma: (s: Partial<ChromaSettings>) => void;
  setPicking: (p: boolean) => void;
  setBusy: (b: boolean) => void;
}

const DEFAULT_EXPORT: ExportSettings = {
  mode: 'static',
  size: 128,
  auto: true,
  colors: 256,
  tolerance: 0,
  frameStep: 1,
  alphaThreshold: 128,
  matte: 'dark',
  speed: 1,
};

const DEFAULT_CHROMA: ChromaSettings = {
  enabled: false,
  color: [0, 255, 0],
  tolerance: 18,
  softness: 8,
  contiguous: true,
};

const toFrames = (list: DecodedFrame[]): Frame[] =>
  list.map((f) => ({ id: uid(), source: f.bitmap, cutout: null, delay: f.delay }));

const release = (f: Frame) => {
  f.source.close();
  f.cutout?.close();
};

export const useStore = create<State>((set, get) => ({
  frames: [],
  kind: null,
  current: 0,
  playing: false,
  name: 'emoji',
  transform: DEFAULT_TRANSFORM,
  exportSettings: DEFAULT_EXPORT,
  chroma: DEFAULT_CHROMA,
  picking: false,
  busy: false,

  load: (list, kind, name) => {
    get().frames.forEach(release);
    const frames = toFrames(list);
    set({
      frames,
      kind,
      name,
      current: 0,
      playing: frames.length > 1,
      transform: DEFAULT_TRANSFORM,
      chroma: { ...get().chroma, enabled: false },
      exportSettings: { ...get().exportSettings, mode: frames.length > 1 ? 'animated' : 'static', speed: 1 },
    });
  },

  append: (list) => {
    const frames = [...get().frames, ...toFrames(list)];
    set({
      frames,
      kind: 'sequence',
      exportSettings: { ...get().exportSettings, mode: frames.length > 1 ? 'animated' : 'static' },
    });
  },

  clear: () => {
    get().frames.forEach(release);
    set({ frames: [], kind: null, current: 0, playing: false, transform: DEFAULT_TRANSFORM });
  },

  removeFrame: (index) => {
    const frames = [...get().frames];
    const [removed] = frames.splice(index, 1);
    if (removed) release(removed);
    if (frames.length === 0) return get().clear();
    set({
      frames,
      current: Math.min(get().current, frames.length - 1),
      exportSettings: frames.length === 1 ? { ...get().exportSettings, mode: 'static' } : get().exportSettings,
    });
  },

  duplicateFrame: (index) => {
    const frames = [...get().frames];
    const f = frames[index];
    if (!f) return;
    // Bitmaps não podem ser compartilhados (release fecha), então clonamos de forma síncrona via canvas
    const clone = (b: ImageBitmap) => {
      const c = new OffscreenCanvas(b.width, b.height);
      c.getContext('2d')!.drawImage(b, 0, 0);
      return c.transferToImageBitmap();
    };
    frames.splice(index + 1, 0, {
      id: uid(),
      source: clone(f.source),
      cutout: f.cutout ? clone(f.cutout) : null,
      delay: f.delay,
    });
    set({ frames, current: index + 1 });
  },

  moveFrame: (from, to) => {
    const frames = [...get().frames];
    if (from === to || !frames[from]) return;
    const [f] = frames.splice(from, 1);
    frames.splice(to, 0, f);
    set({ frames, current: to });
  },

  setFrameDelay: (index, delay) => set({ frames: get().frames.map((f, i) => (i === index ? { ...f, delay } : f)) }),

  setAllDelays: (delay) => set({ frames: get().frames.map((f) => ({ ...f, delay })) }),

  setCutouts: (cutouts) =>
    set({
      frames: get().frames.map((f) => {
        const c = cutouts.get(f.id);
        if (!c) return f;
        f.cutout?.close();
        return { ...f, cutout: c };
      }),
    }),

  clearCutouts: (ids) =>
    set({
      frames: get().frames.map((f) => {
        if (!f.cutout || (ids && !ids.includes(f.id))) return f;
        f.cutout.close();
        return { ...f, cutout: null };
      }),
    }),

  setCurrent: (i) => set({ current: Math.max(0, Math.min(i, get().frames.length - 1)) }),
  setPlaying: (playing) => set({ playing }),
  setName: (name) => set({ name }),
  setTransform: (t) => set({ transform: { ...get().transform, ...t } }),
  resetTransform: () => set({ transform: DEFAULT_TRANSFORM }),
  setExport: (s) => set({ exportSettings: { ...get().exportSettings, ...s } }),
  setChroma: (s) => set({ chroma: { ...get().chroma, ...s } }),
  setPicking: (picking) => set({ picking }),
  setBusy: (busy) => set({ busy }),
}));
