import { FlipHorizontal2, Maximize, Minimize, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { coverZoom, drawTransformed, processedSource } from '../lib/render';
import { useStore } from '../lib/store';
import type { Rotation } from '../lib/types';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;
const CROP_RATIO = 0.74;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

let checker: CanvasPattern | null = null;
function checkerPattern(ctx: CanvasRenderingContext2D, cell: number) {
  const c = document.createElement('canvas');
  c.width = c.height = cell * 2;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a3c42';
  g.fillRect(0, 0, cell * 2, cell * 2);
  g.fillStyle = '#2e3035';
  g.fillRect(0, 0, cell, cell);
  g.fillRect(cell, cell, cell, cell);
  checker = ctx.createPattern(c, 'repeat');
  return checker!;
}

export function Editor() {
  const frames = useStore((s) => s.frames);
  const current = useStore((s) => s.current);
  const transform = useStore((s) => s.transform);
  const chroma = useStore((s) => s.chroma);
  const picking = useStore((s) => s.picking);
  const setTransform = useStore((s) => s.setTransform);
  const { t } = useI18n();

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [side, setSide] = useState(400);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const frame = frames[current] ?? frames[0];
  const crop = side * CROP_RATIO;
  const cropX = (side - crop) / 2;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSide(Math.max(220, Math.floor(Math.min(width, height))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Desenho
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(side * dpr);
    canvas.height = Math.round(side * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, side, side);

    // Fundo xadrez dentro do recorte (mostra a transparência)
    ctx.fillStyle = checker ?? checkerPattern(ctx, 10);
    ctx.fillRect(cropX, cropX, crop, crop);

    drawTransformed(ctx, processedSource(frame, chroma), transform, cropX, cropX, crop);

    // Escurece o que fica fora do recorte
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, side, side);
    ctx.rect(cropX, cropX, crop, crop);
    ctx.fillStyle = 'rgba(17, 18, 20, 0.72)';
    ctx.fill('evenodd');
    ctx.restore();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX - 1, cropX - 1, crop + 2, crop + 2);

    if (dragging) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        const p = cropX + (crop * i) / 3;
        ctx.beginPath();
        ctx.moveTo(p, cropX);
        ctx.lineTo(p, cropX + crop);
        ctx.moveTo(cropX, p);
        ctx.lineTo(cropX + crop, p);
        ctx.stroke();
      }
    }
  }, [frame, transform, chroma, side, crop, cropX, dragging]);

  const pickColor = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !frame) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(clientX - rect.left);
      const y = Math.floor(clientY - rect.top);
      const off = new OffscreenCanvas(side, side);
      const ctx = off.getContext('2d', { willReadFrequently: true })!;
      drawTransformed(ctx, frame.cutout ?? frame.source, transform, cropX, cropX, crop);
      const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
      if (a > 0) useStore.getState().setChroma({ color: [r, g, b], enabled: true });
      useStore.getState().setPicking(false);
    },
    [frame, transform, side, crop, cropX],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (picking) return pickColor(e.clientX, e.clientY);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: transform.offsetX, oy: transform.offsetY };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setTransform({ offsetX: d.ox + (e.clientX - d.x) / crop, offsetY: d.oy + (e.clientY - d.y) / crop });
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const t = useStore.getState().transform;
      setTransform({ zoom: clampZoom(t.zoom * Math.exp(-e.deltaY * 0.0015)) });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [setTransform]);

  if (!frame) return null;

  const rotate = (dir: 1 | -1) =>
    setTransform({ rotation: ((((transform.rotation + dir * 90) % 360) + 360) % 360) as Rotation });
  const zoomSlider = Math.log(transform.zoom / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM);

  return (
    <div className="editor">
      <div className="editor-stage" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          style={{ width: side, height: side, cursor: picking ? 'crosshair' : dragging ? 'grabbing' : 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => setTransform({ offsetX: 0, offsetY: 0 })}
        />
        <span className="stage-hint">
          {picking ? t('editor.pickHint') : t('editor.hint')}
        </span>
      </div>

      <div className="toolbar">
        <div className="tool-group">
          <button className="icon-btn" title={t('editor.rotateLeft')} onClick={() => rotate(-1)}>
            <RotateCcw size={18} />
          </button>
          <button className="icon-btn" title={t('editor.rotateRight')} onClick={() => rotate(1)}>
            <RotateCw size={18} />
          </button>
          <button
            className={`icon-btn ${transform.flipH ? 'active' : ''}`}
            title={t('editor.flip')}
            onClick={() => setTransform({ flipH: !transform.flipH })}
          >
            <FlipHorizontal2 size={18} />
          </button>
        </div>
        <div className="tool-group zoom">
          <button
            className="icon-btn"
            title={t('editor.zoomOut')}
            onClick={() => setTransform({ zoom: clampZoom(transform.zoom / 1.2) })}
          >
            <ZoomOut size={18} />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={zoomSlider}
            style={{ '--fill': `${zoomSlider * 100}%` } as React.CSSProperties}
            onChange={(e) =>
              setTransform({ zoom: clampZoom(MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, Number(e.target.value))) })
            }
          />
          <button
            className="icon-btn"
            title={t('editor.zoomIn')}
            onClick={() => setTransform({ zoom: clampZoom(transform.zoom * 1.2) })}
          >
            <ZoomIn size={18} />
          </button>
          <span className="zoom-label">{Math.round(transform.zoom * 100)}%</span>
        </div>
        <div className="tool-group">
          <button
            className="icon-btn"
            title={t('editor.fit')}
            onClick={() => setTransform({ zoom: 1, offsetX: 0, offsetY: 0 })}
          >
            <Minimize size={18} />
          </button>
          <button
            className="icon-btn"
            title={t('editor.fill')}
            onClick={() => setTransform({ zoom: coverZoom(frame.source, transform), offsetX: 0, offsetY: 0 })}
          >
            <Maximize size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
