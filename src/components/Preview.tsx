import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { EncodeState } from '../lib/hooks';
import { useI18n } from '../i18n';
import { useStore } from '../lib/store';

export function Preview({ state }: { state: EncodeState }) {
  const name = useStore((s) => s.name);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const { url, encoding } = state;
  const { t } = useI18n();
  const emoji = (size: number, cls = '') =>
    url ? (
      <img src={url} width={size} height={size} className={`emoji ${cls}`} alt={`:${name}:`} draggable={false} />
    ) : null;

  return (
    <section className="panel">
      <div className="panel-title">
        <h3>{t('preview.title')}</h3>
        {encoding && (
          <span className="encoding">
            <Loader2 size={14} className="spin" /> {t('preview.encoding')}
          </span>
        )}
        <div className="segmented small">
          <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>
            {t('theme.dark')}
          </button>
          <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>
            {t('theme.light')}
          </button>
        </div>
      </div>

      <div className={`preview-grid theme-${theme}`}>
        <div className="preview-tile">
          <div className="reaction">
            {emoji(18)}
            <span>6</span>
          </div>
        </div>
        <div className="preview-tile checker">{emoji(96)}</div>
      </div>

      <div className={`chat theme-${theme}`}>
        <div className="chat-avatar">{emoji(40, 'avatar-emoji')}</div>
        <div className="chat-body">
          <div className="chat-head">
            <span className="chat-name">{t('preview.you')}</span>
            <span className="chat-time">{t('preview.time')}</span>
          </div>
          <div className="chat-text">
            {t('preview.message')} {emoji(22, 'inline')} <code>:{name}:</code>
          </div>
          <div className="chat-jumbo">
            {emoji(48)}
            {emoji(48)}
            {emoji(48)}
          </div>
        </div>
      </div>
    </section>
  );
}
