import { CircleHelp, FilePlus2, Languages, RotateCcw, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackgroundPanel } from './components/BackgroundPanel';
import { Editor } from './components/Editor';
import { EmptyState, type PickKind } from './components/EmptyState';
import { DownloadPanel, OptimizePanel, OutputPanel } from './components/ExportPanel';
import { Preview } from './components/Preview';
import { Select } from './components/Select';
import { Timeline } from './components/Timeline';
import { VideoImporter } from './components/VideoImporter';
import { useEncodedEmoji, usePlayback } from './lib/hooks';
import { decodeAnimated, isImage, isVideo, loadSequence, sanitizeName, type DecodedFrame } from './lib/importers';
import { LOCALES, useI18n, useLocale, type Locale, type TKey } from './i18n';
import { useStore } from './lib/store';

type InputKind = PickKind | 'append';

const ACCEPT: Record<InputKind, string> = {
  image: 'image/*',
  sequence: 'image/*',
  append: 'image/*',
  video: 'video/*,image/gif,image/webp,image/png,image/apng,image/avif',
};

export default function App() {
  const frames = useStore((s) => s.frames);
  const kind = useStore((s) => s.kind);
  const [video, setVideo] = useState<File | null>(null);
  // label e error guardam chaves de tradução, traduzidas na renderização (trocar o idioma atualiza tudo)
  const [progress, setProgress] = useState<{ label: TKey; value: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputKind = useRef<InputKind>('image');
  const { t, tn, tError, locale } = useI18n();
  const setLocale = useLocale((s) => s.setLocale);

  usePlayback();
  const encoded = useEncodedEmoji();

  const handleFiles = useCallback(async (files: File[], mode: InputKind | 'auto' = 'auto') => {
    setError(null);
    const videos = files.filter(isVideo);
    const images = files.filter(isImage);
    try {
      if (videos.length && mode !== 'append') {
        setVideo(videos[0]);
        return;
      }
      if (!images.length) throw new Error('error.unsupported');
      const report = (label: TKey) => (d: number, t: number) => setProgress({ label, value: d / t });

      if (mode === 'append') {
        setProgress({ label: 'progress.adding', value: 0 });
        useStore.getState().append(await loadSequence(images, report('progress.adding')));
      } else if (images.length === 1 && mode !== 'sequence') {
        setProgress({ label: 'progress.decoding', value: 0 });
        const decoded = await decodeAnimated(images[0], report('progress.decoding'));
        useStore.getState().load(decoded, decoded.length > 1 ? 'animation' : 'image', sanitizeName(images[0].name));
      } else {
        setProgress({ label: 'progress.sequence', value: 0 });
        const decoded = await loadSequence(images, report('progress.sequence'));
        useStore.getState().load(decoded, 'sequence', sanitizeName(images[0].name.replace(/[-_ ]?\d+(\.\w+)?$/, '')));
      }
    } catch (err) {
      console.error(err);
      setError((err as Error).message);
    } finally {
      setProgress(null);
    }
  }, []);

  const pick = (k: InputKind) => {
    inputKind.current = k;
    const input = inputRef.current!;
    input.accept = ACCEPT[k];
    input.multiple = k === 'sequence' || k === 'append';
    input.value = '';
    input.click();
  };

  // Arrastar e soltar em qualquer lugar + colar da área de transferência
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) handleFiles(files);
    };
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        handleFiles(files);
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
      const s = useStore.getState();
      if (s.frames.length > 1) {
        e.preventDefault();
        s.setPlaying(!s.playing);
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    window.addEventListener('paste', paste);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
      window.removeEventListener('paste', paste);
      window.removeEventListener('keydown', key);
    };
  }, [handleFiles]);

  const onVideoDone = (decoded: DecodedFrame[]) => {
    useStore.getState().load(decoded, 'video', sanitizeName(video!.name));
    setVideo(null);
  };

  const hasProject = frames.length > 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={30} height={30} />
          <span>
            Emoji<b>Forge</b>
          </span>
        </div>
        {hasProject && (
          <div className="topbar-actions">
            <span className="kind-pill">
              <Sparkles size={13} />
              {kind && t(`kind.${kind}`)} · {tn('frames', frames.length)}
            </span>
            {frames.length === 1 && (
              <button className="btn ghost" onClick={() => pick('append')} title={t('top.addFramesHint')}>
                <FilePlus2 size={16} /> {t('top.addFrames')}
              </button>
            )}
            <button className="btn ghost" onClick={() => useStore.getState().resetTransform()}>
              <RotateCcw size={16} /> {t('top.resetFraming')}
            </button>
            <button className="btn ghost" onClick={() => useStore.getState().clear()}>
              <X size={16} /> {t('top.new')}
            </button>
          </div>
        )}
        <Select<Locale>
          className={`lang-select ${hasProject ? '' : 'push'}`}
          value={locale}
          onChange={setLocale}
          options={LOCALES.map((l) => ({ value: l.id, label: l.label, hint: l.id.toUpperCase() }))}
          icon={<Languages size={16} />}
          ariaLabel={t('lang.label')}
          title={t('lang.label')}
          align="end"
        />
        <a
          className="icon-btn subtle"
          href={`https://support.discord.com/hc/${LOCALES.find((l) => l.id === locale)!.discord}/search?query=emoji`}
          target="_blank"
          rel="noreferrer"
          title={t('top.help')}
        >
          <CircleHelp size={18} />
        </a>
      </header>

      {error && (
        <div className="toast" onClick={() => setError(null)}>
          {tError(error)}
        </div>
      )}

      {!hasProject ? (
        <EmptyState onPick={pick} dragging={dragging} progress={progress} />
      ) : (
        <main className="workspace">
          <section className="canvas-area">
            <div className="canvas-card">
              <Editor />
              {frames.length > 1 && <Timeline onAddFrames={() => pick('append')} />}
            </div>
            {progress && (
              <div className="loading-inline">
                {t(progress.label)} {Math.round(progress.value * 100)}%
              </div>
            )}
          </section>
          <aside className="sidebar">
            <Preview state={encoded} />
            <OutputPanel />
            <BackgroundPanel />
            <OptimizePanel />
            <DownloadPanel state={encoded} />
          </aside>
        </main>
      )}

      {dragging && hasProject && <div className="drop-overlay">{t('drop.replace')}</div>}

      {video && <VideoImporter file={video} onCancel={() => setVideo(null)} onDone={onVideoDone} />}

      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (!files.length) return;
          const k = inputKind.current;
          handleFiles(files, k === 'video' ? 'auto' : k);
        }}
      />
    </div>
  );
}
