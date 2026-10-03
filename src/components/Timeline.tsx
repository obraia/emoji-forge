import { Copy, Pause, Play, Plus, SkipBack, SkipForward, Trash2 } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { useStore } from '../lib/store';
import type { Frame } from '../lib/types';

const Thumb = memo(function Thumb({ frame }: { frame: Frame }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const img = frame.cutout ?? frame.source;
    const S = 112;
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, S, S);
    const s = S / Math.max(img.width, img.height);
    const w = img.width * s;
    const h = img.height * s;
    ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
  }, [frame.source, frame.cutout]);
  return <canvas ref={ref} className="thumb-canvas" />;
});

export function Timeline({ onAddFrames }: { onAddFrames: () => void }) {
  const frames = useStore((s) => s.frames);
  const current = useStore((s) => s.current);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.exportSettings.speed);
  const { setCurrent, setPlaying, moveFrame, removeFrame, duplicateFrame, setFrameDelay, setAllDelays } =
    useStore.getState();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const { t, tr } = useI18n();

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);

  const total = frames.reduce((a, f) => a + f.delay, 0) / speed;
  const avgDelay = frames.reduce((a, f) => a + f.delay, 0) / Math.max(1, frames.length);
  const fps = Math.round((1000 / avgDelay) * 10) / 10;
  const frame = frames[current];

  return (
    <div className="timeline">
      <div className="timeline-head">
        <div className="tool-group">
          <button
            className="icon-btn"
            title={t('timeline.prev')}
            onClick={() => setCurrent((current - 1 + frames.length) % frames.length)}
          >
            <SkipBack size={16} />
          </button>
          <button
            className="icon-btn primary"
            title={playing ? t('timeline.pause') : t('timeline.play')}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="icon-btn" title={t('timeline.next')} onClick={() => setCurrent((current + 1) % frames.length)}>
            <SkipForward size={16} />
          </button>
        </div>
        <div className="timeline-meta">
          <span>{tr('timeline.frame', { current: <b>{current + 1}</b>, total: frames.length })}</span>
          <span className="dot" />
          <span>{(total / 1000).toFixed(2)}s</span>
          <span className="dot" />
          <label className="inline-field" title={t('timeline.fpsHint')}>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              value={fps}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) setAllDelays(Math.max(20, Math.round(1000 / v)));
              }}
            />
            FPS
          </label>
          {frame && (
            <>
              <span className="dot" />
              <label className="inline-field" title={t('timeline.delayHint')}>
                <input
                  type="number"
                  min={20}
                  max={10000}
                  step={10}
                  value={Math.round(frame.delay)}
                  onChange={(e) => setFrameDelay(current, Math.max(20, Number(e.target.value) || 20))}
                />
                ms
              </label>
            </>
          )}
        </div>
        <div className="tool-group">
          <button className="icon-btn" title={t('timeline.duplicate')} onClick={() => duplicateFrame(current)}>
            <Copy size={16} />
          </button>
          <button className="icon-btn danger" title={t('timeline.remove')} onClick={() => removeFrame(current)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="frames-strip">
        {frames.map((f, i) => (
          <div
            key={f.id}
            ref={i === current ? activeRef : undefined}
            className={`frame-thumb ${i === current ? 'active' : ''} ${dragOver === i && dragFrom !== i ? 'drop-target' : ''}`}
            draggable
            onClick={() => {
              setPlaying(false);
              setCurrent(i);
            }}
            onDragStart={(e) => {
              setDragFrom(i);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              setDragOver(i);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragFrom !== null) moveFrame(dragFrom, i);
              setDragFrom(null);
              setDragOver(null);
            }}
          >
            <Thumb frame={f} />
            <span className="frame-index">{i + 1}</span>
            {f.cutout && (
              <span className="frame-badge" title={t('timeline.bgRemoved')}>
                {t('timeline.aiBadge')}
              </span>
            )}
          </div>
        ))}
        <button className="frame-add" onClick={onAddFrames} title={t('timeline.addImages')}>
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
}
