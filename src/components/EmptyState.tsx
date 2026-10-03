import { Film, Image as ImageIcon, Layers, Loader2, UploadCloud } from 'lucide-react';
import { useI18n, type TKey } from '../i18n';

export type PickKind = 'image' | 'sequence' | 'video';

export function EmptyState(props: {
  onPick: (kind: PickKind) => void;
  dragging: boolean;
  progress: { label: TKey; value: number } | null;
}) {
  const { onPick, dragging, progress } = props;
  const { t, tr } = useI18n();
  return (
    <div className={`empty ${dragging ? 'dragging' : ''}`}>
      <div className="hero">
        <div className="hero-emojis" aria-hidden>
          <span>😹</span>
          <span>🔥</span>
          <span>🚀</span>
        </div>
        <h1>{tr('empty.title', { discord: <span className="accent">Discord</span> })}</h1>
        <p>{tr('empty.subtitle', { limit: <b>256 KB</b> })}</p>
      </div>

      {progress ? (
        <div className="loading-card">
          <Loader2 className="spin" size={22} />
          <span>{t(progress.label)}</span>
          <div className="meter-bar">
            <div style={{ width: `${progress.value * 100}%` }} />
          </div>
        </div>
      ) : (
        <>
          <div className="pick-grid">
            <button className="pick" onClick={() => onPick('image')}>
              <span className="pick-icon blurple">
                <ImageIcon size={26} />
              </span>
              <b>{t('empty.image.title')}</b>
              <span>{t('empty.image.desc')}</span>
            </button>
            <button className="pick" onClick={() => onPick('sequence')}>
              <span className="pick-icon green">
                <Layers size={26} />
              </span>
              <b>{t('empty.sequence.title')}</b>
              <span>{t('empty.sequence.desc')}</span>
            </button>
            <button className="pick" onClick={() => onPick('video')}>
              <span className="pick-icon pink">
                <Film size={26} />
              </span>
              <b>{t('empty.video.title')}</b>
              <span>{t('empty.video.desc')}</span>
            </button>
          </div>
          <div className="drop-hint">
            <UploadCloud size={18} />
            <span>
              {tr('empty.dropHint', {
                shortcut: (
                  <>
                    <kbd>Ctrl</kbd>+<kbd>V</kbd>
                  </>
                ),
              })}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
