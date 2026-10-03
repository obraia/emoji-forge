import { AlertTriangle, CheckCircle2, Download, Film, Image as ImageIcon, Sparkles } from 'lucide-react';
import type { EncodeState } from '../lib/hooks';
import { useI18n } from '../i18n';
import { useStore } from '../lib/store';
import { LIMIT_BYTES, type Matte } from '../lib/types';

const SIZES = [64, 96, 128, 160, 256];
const NAME_RE = /^[A-Za-z0-9_]{2,32}$/;

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step = 1, format = String, hint, onChange } = props;
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider" title={hint}>
      <span className="slider-label">
        {label}
        <b>{format(value)}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function OutputPanel() {
  const s = useStore((st) => st.exportSettings);
  const frameCount = useStore((st) => st.frames.length);
  const name = useStore((st) => st.name);
  const setName = useStore((st) => st.setName);
  const setExport = useStore((st) => st.setExport);
  const animated = s.mode === 'animated';
  const nameOk = NAME_RE.test(name);
  const { t } = useI18n();

  return (
    <section className="panel">
      <div className="panel-title">
        <h3>{t('output.title')}</h3>
      </div>

      <label className="field">
        <span>
          {t('output.name')} <em>*</em>
        </span>
        <div className={`input-wrap ${nameOk ? '' : 'invalid'}`}>
          <span className="colon">:</span>
          <input
            value={name}
            maxLength={32}
            spellCheck={false}
            onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, '_'))}
          />
          <span className="colon">:</span>
        </div>
        {!nameOk && <small className="error-text">{t('output.nameError')}</small>}
      </label>

      <div className="segmented">
        <button className={!animated ? 'on' : ''} onClick={() => setExport({ mode: 'static' })}>
          <ImageIcon size={15} /> {t('output.static')}
        </button>
        <button
          className={animated ? 'on' : ''}
          disabled={frameCount < 2}
          title={frameCount < 2 ? t('output.needFrames') : undefined}
          onClick={() => setExport({ mode: 'animated' })}
        >
          <Film size={15} /> {t('output.animated')}
        </button>
      </div>

      <div className="field">
        <span>{t('output.size')}</span>
        <div className="chips">
          {SIZES.map((sz) => (
            <button key={sz} className={`chip ${s.size === sz ? 'on' : ''}`} onClick={() => setExport({ size: sz })}>
              {sz}
              {sz === 128 && <i>★</i>}
            </button>
          ))}
        </div>
        <small className="muted">{t('output.sizeHint')}</small>
      </div>

      {animated && (
        <Slider
          label={t('output.speed')}
          value={s.speed}
          min={0.25}
          max={4}
          step={0.05}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(v) => setExport({ speed: v })}
        />
      )}
    </section>
  );
}

export function OptimizePanel() {
  const s = useStore((st) => st.exportSettings);
  const setExport = useStore((st) => st.setExport);
  const { t } = useI18n();
  if (s.mode !== 'animated') return null;

  return (
    <section className="panel">
      <div className="panel-title">
        <h3>{t('opt.title')}</h3>
        <label className="switch">
          <input type="checkbox" checked={s.auto} onChange={(e) => setExport({ auto: e.target.checked })} />
          <span className="switch-track" />
          <span>{t('opt.auto')}</span>
        </label>
      </div>
      {s.auto ? (
        <p className="muted small-text">
          <Sparkles size={13} /> {t('opt.autoDesc')}
        </p>
      ) : (
        <>
          <Slider
            label={t('opt.colors')}
            value={s.colors}
            min={8}
            max={256}
            step={8}
            onChange={(v) => setExport({ colors: v })}
          />
          <Slider
            label={t('opt.tolerance')}
            hint={t('opt.toleranceHint')}
            value={s.tolerance}
            min={0}
            max={40}
            onChange={(v) => setExport({ tolerance: v })}
          />
          <Slider
            label={t('opt.frameStep')}
            value={s.frameStep}
            min={1}
            max={6}
            format={(v) => (v === 1 ? t('opt.allFrames') : `1/${v}`)}
            onChange={(v) => setExport({ frameStep: v })}
          />
        </>
      )}
      <div className="divider" />
      <Slider
        label={t('opt.alpha')}
        hint={t('opt.alphaHint')}
        value={s.alphaThreshold}
        min={1}
        max={254}
        onChange={(v) => setExport({ alphaThreshold: v })}
      />
      <div className="field">
        <span>{t('opt.matte')}</span>
        <div className="segmented small">
          {(
            [
              ['dark', t('theme.dark')],
              ['light', t('theme.light')],
              ['none', t('theme.none')],
            ] as [Matte, string][]
          ).map(([m, l]) => (
            <button key={m} className={s.matte === m ? 'on' : ''} onClick={() => setExport({ matte: m })}>
              {l}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DownloadPanel({ state }: { state: EncodeState }) {
  const name = useStore((st) => st.name);
  const { result, url } = state;
  const nameOk = NAME_RE.test(name);
  const pct = result ? Math.min(100, (result.bytes / LIMIT_BYTES) * 100) : 0;
  const level = !result ? '' : result.overLimit ? 'bad' : pct > 85 ? 'warn' : 'good';
  const { t, tr, tn, tError, num } = useI18n();

  return (
    <section className="panel export">
      <div className={`meter ${level}`}>
        <div className="meter-head">
          <span>
            {result ? (
              tr('dl.of', { size: <b>{num(result.bytes / 1000)} KB</b> })
            ) : (
              t('dl.calculating')
            )}
          </span>
          {result &&
            (result.overLimit ? (
              <span className="meter-status bad">
                <AlertTriangle size={14} /> {t('dl.tooBig')}
              </span>
            ) : (
              <span className="meter-status good">
                <CheckCircle2 size={14} /> {t('dl.ok')}
              </span>
            ))}
        </div>
        <div className="meter-bar">
          <div style={{ width: `${pct}%` }} />
        </div>
        {result && (
          <div className="meter-details">
            {result.size}×{result.size} · {result.mime === 'image/gif' ? 'GIF' : 'PNG'}
            {result.mime === 'image/gif' && (
              <>
                {' '}
                · {tn('frames', result.frames)} · {t('dl.colors', { n: result.colors })}
                {result.frameStep > 1 && ` · ${t('dl.step', { n: result.frameStep })}`}
              </>
            )}
          </div>
        )}
        {state.error && <div className="error-text">{tError(state.error)}</div>}
      </div>

      <a
        className={`btn primary big ${!url || !nameOk || result?.overLimit ? 'disabled' : ''}`}
        href={url ?? undefined}
        download={result ? `${name}.${result.mime === 'image/gif' ? 'gif' : 'png'}` : undefined}
        onClick={(e) => {
          if (!url || !nameOk || result?.overLimit) e.preventDefault();
        }}
      >
        <Download size={18} /> {t('dl.download')}
      </a>
    </section>
  );
}
