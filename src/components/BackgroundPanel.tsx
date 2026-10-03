import { Cpu, Eraser, Pipette, Scan, Undo2, Wand2, X, Zap } from 'lucide-react';
import { useRef, useState } from 'react';
import { bgRemover, webgpuSupported, type Device } from '../lib/bgRemoval';
import { useI18n } from '../i18n';
import { BG_MODELS } from '../lib/models';
import { bitmapToImageData, sampleCornerColor } from '../lib/render';
import { useStore } from '../lib/store';

type Status =
  | { phase: 'idle' }
  | { phase: 'loading'; progress: number }
  | { phase: 'running'; done: number; total: number }
  | { phase: 'error'; message: string };

const toHex = (c: number[]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

export function BackgroundPanel() {
  const frames = useStore((s) => s.frames);
  const current = useStore((s) => s.current);
  const chroma = useStore((s) => s.chroma);
  const picking = useStore((s) => s.picking);
  const { setChroma, setPicking, setCutouts, clearCutouts, setBusy, setPlaying } = useStore.getState();

  const [tab, setTab] = useState<'ai' | 'color'>('ai');
  const [model, setModel] = useState(BG_MODELS[0].id);
  const [scope, setScope] = useState<'all' | 'current'>('all');
  const [status, setStatus] = useState<Status>({ phase: 'idle' });
  const [device, setDevice] = useState<Device | null>(null);
  const cancel = useRef(false);
  const { t, tError } = useI18n();

  const hasCutouts = frames.some((f) => f.cutout);
  const working = status.phase === 'loading' || status.phase === 'running';
  const gpu = webgpuSupported();

  async function removeBackground() {
    const targets = scope === 'all' ? frames : [frames[current]];
    if (!targets.length) return;
    cancel.current = false;
    setBusy(true);
    setPlaying(false);
    setStatus({ phase: 'loading', progress: 0 });
    try {
      const remover = bgRemover();
      const dev = await remover.load(model, 'auto', (p) => setStatus({ phase: 'loading', progress: p }));
      setDevice(dev);
      const results = new Map<string, ImageBitmap>();
      for (let i = 0; i < targets.length; i++) {
        if (cancel.current) break;
        setStatus({ phase: 'running', done: i, total: targets.length });
        const out = await remover.run(bitmapToImageData(targets[i].source));
        results.set(targets[i].id, await createImageBitmap(out));
        if (targets.length > 1) useStore.getState().setCurrent(frames.indexOf(targets[i]));
      }
      if (!cancel.current) setCutouts(results);
      else results.forEach((b) => b.close());
      setStatus({ phase: 'idle' });
    } catch (err) {
      console.error(err);
      setStatus({ phase: 'error', message: (err as Error).message || 'error.modelRun' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <h3>{t('bg.title')}</h3>
        <div className="segmented small">
          <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>
            <Wand2 size={13} /> {t('bg.ai')}
          </button>
          <button className={tab === 'color' ? 'on' : ''} onClick={() => setTab('color')}>
            <Eraser size={13} /> {t('bg.color')}
          </button>
        </div>
      </div>

      {tab === 'ai' ? (
        <>
          <div className="model-list">
            {BG_MODELS.map((m) => (
              <button
                key={m.id}
                className={`model ${model === m.id ? 'on' : ''}`}
                onClick={() => setModel(m.id)}
                disabled={working}
              >
                <span className="model-name">
                  {m.label}
                  <small>{t(`model.${m.key}.license`)}</small>
                </span>
                <span className="model-desc">{t(`model.${m.key}.desc`)}</span>
                <span className="model-size">{t(`model.${m.key}.size`)}</span>
              </button>
            ))}
          </div>

          <div className="row between">
            <span className={`badge ${gpu ? 'ok' : ''}`} title={t('bg.localHint')}>
              {gpu ? <Zap size={12} /> : <Cpu size={12} />}
              {device
                ? device === 'webgpu'
                  ? t('bg.webgpuActive')
                  : t('bg.wasmActive')
                : gpu
                  ? t('bg.webgpuAvailable')
                  : t('bg.wasmOnly')}
            </span>
            {frames.length > 1 && (
              <div className="segmented small">
                <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')} disabled={working}>
                  {t('bg.all', { n: frames.length })}
                </button>
                <button
                  className={scope === 'current' ? 'on' : ''}
                  onClick={() => setScope('current')}
                  disabled={working}
                >
                  {t('bg.current')}
                </button>
              </div>
            )}
          </div>

          {working ? (
            <div className="progress-box">
              <div className="row between">
                <span>
                  {status.phase === 'loading'
                    ? t('bg.downloading', { p: Math.round(status.progress * 100) })
                    : t('bg.processing', { i: status.done + 1, n: status.total })}
                </span>
                <button className="icon-btn" title={t('common.cancel')} onClick={() => (cancel.current = true)}>
                  <X size={14} />
                </button>
              </div>
              <div className="meter-bar">
                <div
                  style={{
                    width: `${
                      status.phase === 'loading' ? status.progress * 100 : (status.done / status.total) * 100
                    }%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="row gap">
              <button className="btn primary grow" onClick={removeBackground}>
                <Wand2 size={16} /> {t('bg.remove')}
              </button>
              {hasCutouts && (
                <button className="btn" onClick={() => clearCutouts()} title={t('bg.restore')}>
                  <Undo2 size={16} />
                </button>
              )}
            </div>
          )}
          {status.phase === 'error' && <p className="error-text">{tError(status.message)}</p>}
          <p className="muted small-text">
            {t('bg.cacheNote')}
          </p>
        </>
      ) : (
        <>
          <label className="switch">
            <input
              type="checkbox"
              checked={chroma.enabled}
              onChange={(e) => setChroma({ enabled: e.target.checked })}
            />
            <span className="switch-track" />
            <span>{t('chroma.enable')}</span>
          </label>
          <div className="row gap">
            <label className="color-swatch" style={{ background: toHex(chroma.color) }} title={t('chroma.pickColor')}>
              <input
                type="color"
                value={toHex(chroma.color)}
                onChange={(e) => setChroma({ color: fromHex(e.target.value), enabled: true })}
              />
            </label>
            <button className={`btn ${picking ? 'active' : ''}`} onClick={() => setPicking(!picking)}>
              <Pipette size={15} /> {t('chroma.eyedropper')}
            </button>
            <button
              className="btn"
              title={t('chroma.autoHint')}
              onClick={() => {
                const f = frames[current];
                if (f) setChroma({ color: sampleCornerColor(f.cutout ?? f.source), enabled: true });
              }}
            >
              <Scan size={15} /> {t('chroma.auto')}
            </button>
          </div>
          <div className={chroma.enabled ? '' : 'disabled-area'}>
            <label className="slider">
              <span className="slider-label">
                {t('chroma.tolerance')} <b>{chroma.tolerance}</b>
              </span>
              <input
                type="range"
                min={0}
                max={60}
                value={chroma.tolerance}
                style={{ '--fill': `${(chroma.tolerance / 60) * 100}%` } as React.CSSProperties}
                onChange={(e) => setChroma({ tolerance: Number(e.target.value) })}
              />
            </label>
            <label className="slider">
              <span className="slider-label">
                {t('chroma.softness')} <b>{chroma.softness}</b>
              </span>
              <input
                type="range"
                min={0}
                max={40}
                value={chroma.softness}
                style={{ '--fill': `${(chroma.softness / 40) * 100}%` } as React.CSSProperties}
                onChange={(e) => setChroma({ softness: Number(e.target.value) })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={chroma.contiguous}
                onChange={(e) => setChroma({ contiguous: e.target.checked })}
              />
              {t('chroma.contiguous')}
            </label>
          </div>
        </>
      )}
    </section>
  );
}
