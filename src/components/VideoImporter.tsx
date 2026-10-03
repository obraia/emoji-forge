import { Film, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { extractVideoFrames, MAX_FRAMES, type DecodedFrame } from '../lib/importers';

const FPS_OPTIONS = [8, 10, 12, 15, 20, 25];
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

export function VideoImporter(props: { file: File; onCancel: () => void; onDone: (frames: DecodedFrame[]) => void }) {
  const { file, onCancel, onDone } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string>();
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [fps, setFps] = useState(12);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const { t, tn, tError, num } = useI18n();

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const [start, end] = range;
  const frameCount = Math.min(MAX_FRAMES, Math.max(1, Math.ceil((end - start) * fps)));

  // Reproduz em loop só o trecho selecionado
  useEffect(() => {
    const v = videoRef.current;
    if (!v || progress !== null) return;
    const onTime = () => {
      if (v.currentTime >= end || v.currentTime < start - 0.05) v.currentTime = start;
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [start, end, progress]);

  async function run() {
    const v = videoRef.current;
    if (!v) return;
    abort.current = new AbortController();
    setProgress(0);
    try {
      const frames = await extractVideoFrames(
        v,
        { start, end, fps },
        (d, t) => setProgress(d / t),
        abort.current.signal,
      );
      onDone(frames);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
      setProgress(null);
    }
  }

  const setStart = (v: number) => setRange([Math.min(v, end - 0.1), end]);
  const setEnd = (v: number) => setRange([start, Math.max(v, start + 0.1)]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && progress === null && onCancel()}
    >
      <div className="modal">
        <div className="modal-head">
          <h2>
            <Film size={20} /> {t('video.title')}
          </h2>
          <button className="icon-btn" onClick={() => (progress !== null ? abort.current?.abort() : onCancel())}>
            <X size={18} />
          </button>
        </div>
        <p className="muted small-text">{file.name}</p>

        <video
          ref={videoRef}
          src={url}
          className="video-preview"
          muted
          autoPlay
          playsInline
          onLoadedMetadata={async (e) => {
            const v = e.currentTarget;
            let d = v.duration;
            if (!Number.isFinite(d)) {
              // WebM gravado pelo MediaRecorder não traz a duração: busca o fim para descobri-la
              d = await new Promise<number>((resolve) => {
                v.addEventListener('durationchange', () => Number.isFinite(v.duration) && resolve(v.duration));
                setTimeout(() => resolve(Number.isFinite(v.duration) ? v.duration : 10), 3000);
                v.currentTime = 1e7;
              });
              v.currentTime = 0;
            }
            setDuration(d);
            setRange([0, Math.min(d, 3)]);
          }}
          onError={() => setError('error.videoRead')}
        />

        {duration > 0 && (
          <>
            <div className="range-dual">
              <div
                className="range-fill"
                style={{ left: `${(start / duration) * 100}%`, right: `${100 - (end / duration) * 100}%` }}
              />
              <input
                type="range"
                min={0}
                max={duration}
                step={0.05}
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
              />
              <input
                type="range"
                min={0}
                max={duration}
                step={0.05}
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
              />
            </div>
            <div className="row between muted small-text">
              <span>{t('video.start', { t: fmt(start) })}</span>
              <span>{t('video.clip', { s: num(end - start) })}</span>
              <span>{t('video.end', { t: fmt(end) })}</span>
            </div>

            <div className="field">
              <span>{t('video.fps')}</span>
              <div className="chips">
                {FPS_OPTIONS.map((f) => (
                  <button key={f} className={`chip ${fps === f ? 'on' : ''}`} onClick={() => setFps(f)}>
                    {f}
                  </button>
                ))}
              </div>
              <small className={frameCount > 60 ? 'warn-text' : 'muted'}>
                {tn('frames', frameCount)}
                {frameCount > 60 && ` — ${t('video.tooMany')}`}
              </small>
            </div>
          </>
        )}

        {error && <p className="error-text">{tError(error)}</p>}

        <div className="modal-actions">
          {progress !== null ? (
            <div className="progress-box grow">
              <div className="row between">
                <span>
                  <Loader2 size={14} className="spin" /> {t('video.extracting', { p: Math.round(progress * 100) })}
                </span>
                <button className="btn" onClick={() => abort.current?.abort()}>
                  {t('common.cancel')}
                </button>
              </div>
              <div className="meter-bar">
                <div style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
          ) : (
            <>
              <button className="btn" onClick={onCancel}>
                {t('common.cancel')}
              </button>
              <button className="btn primary" onClick={run} disabled={!duration}>
                {t('video.import', { n: frameCount })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
