import { useEffect, useRef, useState } from 'react';
import { encoder, Superseded } from './encoder';
import { renderFrames } from './render';
import { useStore } from './store';
import type { EncodeResult } from './types';

/** Avança os quadros conforme a duração de cada um. */
export function usePlayback() {
  const playing = useStore((s) => s.playing);
  const frames = useStore((s) => s.frames);
  const current = useStore((s) => s.current);
  const speed = useStore((s) => s.exportSettings.speed);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const delay = Math.max(20, (frames[current]?.delay ?? 100) / speed);
    const t = setTimeout(() => useStore.getState().setCurrent((current + 1) % frames.length), delay);
    return () => clearTimeout(t);
  }, [playing, frames, current, speed]);
}

export interface EncodeState {
  result: EncodeResult | null;
  url: string | null;
  encoding: boolean;
  error: string | null;
}

/** Re-codifica o emoji final (com debounce) sempre que algo relevante muda. */
export function useEncodedEmoji(): EncodeState {
  const frames = useStore((s) => s.frames);
  const transform = useStore((s) => s.transform);
  const chroma = useStore((s) => s.chroma);
  const settings = useStore((s) => s.exportSettings);
  const busy = useStore((s) => s.busy);
  // No modo estático, o quadro exportado é o atual — mas não re-codifica durante a reprodução
  const current = useStore((s) => (s.exportSettings.mode === 'static' && !s.playing ? s.current : -1));

  const [state, setState] = useState<EncodeState>({ result: null, url: null, encoding: false, error: null });
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (frames.length === 0 || busy) return;
    setState((s) => ({ ...s, encoding: true }));
    const timer = setTimeout(async () => {
      try {
        const isStatic = settings.mode === 'static';
        const src = isStatic ? [frames[Math.max(0, current)] ?? frames[0]] : frames;
        const rendered = renderFrames(src, transform, settings.size, chroma);
        const result = await encoder().encode({
          mode: settings.mode,
          size: settings.size,
          frames: rendered.map((img, i) => ({
            data: img.data.buffer as ArrayBuffer,
            delay: src[i].delay / settings.speed,
          })),
          auto: settings.auto,
          colors: settings.colors,
          tolerance: settings.tolerance,
          frameStep: settings.frameStep,
          alphaThreshold: settings.alphaThreshold,
          matte: settings.matte,
        });
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(result.blob);
        urlRef.current = url;
        setState({ result, url, encoding: false, error: null });
      } catch (err) {
        if (err instanceof Superseded) return;
        setState((s) => ({ ...s, encoding: false, error: (err as Error).message }));
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [frames, transform, chroma, settings, busy, current]);

  useEffect(() => {
    if (frames.length === 0) {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setState({ result: null, url: null, encoding: false, error: null });
    }
  }, [frames.length]);

  return state;
}
