import { Fragment, createElement, useCallback, type ReactNode } from 'react';
import { create } from 'zustand';
import enUS from './en-US';
import es from './es';
import ptBR, { type Dict } from './pt-BR';

export type Locale = 'pt-BR' | 'en-US' | 'es';
export type TKey = keyof Dict;
type Vars = Record<string, string | number>;

export const LOCALES: { id: Locale; label: string; discord: string }[] = [
  { id: 'pt-BR', label: 'Português (BR)', discord: 'pt-br' },
  { id: 'en-US', label: 'English (US)', discord: 'en-us' },
  { id: 'es', label: 'Español', discord: 'es' },
];

const DICTS: Record<Locale, Dict> = { 'pt-BR': ptBR, 'en-US': enUS, es };
const STORAGE_KEY = 'emojiforge.locale';

function fromTag(tag: string): Locale | null {
  const t = tag.toLowerCase();
  if (t.startsWith('pt')) return 'pt-BR';
  if (t.startsWith('es')) return 'es';
  if (t.startsWith('en')) return 'en-US';
  return null;
}

/** Escolha salva > idiomas do navegador (em ordem de preferência) > inglês. */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in DICTS) return saved as Locale;
  } catch {
    /* armazenamento indisponível */
  }
  const tags = typeof navigator !== 'undefined' ? [...(navigator.languages ?? []), navigator.language] : [];
  for (const tag of tags) {
    const l = tag && fromTag(tag);
    if (l) return l;
  }
  return 'en-US';
}

interface LocaleState {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

export const useLocale = create<LocaleState>((set) => ({
  locale: detectLocale(),
  setLocale: (locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* armazenamento indisponível */
    }
    set({ locale });
  },
}));

function applyDocument(locale: Locale) {
  document.documentElement.lang = locale;
  document.title = DICTS[locale]['app.title'];
}
applyDocument(useLocale.getState().locale);
useLocale.subscribe((s) => applyDocument(s.locale));

export function translate(locale: Locale, key: TKey, vars?: Vars): string {
  const s = DICTS[locale][key] ?? ptBR[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

export const isTKey = (k: string): k is TKey => k in ptBR;

export function useI18n() {
  const locale = useLocale((s) => s.locale);

  const t = useCallback((key: TKey, vars?: Vars) => translate(locale, key, vars), [locale]);

  /** Tradução com placeholders que podem ser elementos React (ex.: {discord} → <span>). */
  const tr = useCallback(
    (key: TKey, nodes: Record<string, ReactNode>): ReactNode =>
      DICTS[locale][key]
        .split(/(\{\w+\})/g)
        .map((part, i) => {
          const m = /^\{(\w+)\}$/.exec(part);
          return createElement(Fragment, { key: i }, m && m[1] in nodes ? nodes[m[1]] : part);
        }),
    [locale],
  );

  /** Pluralização simples: chaves `<base>.one` / `<base>.other`. */
  const tn = useCallback(
    (base: 'frames', n: number) => translate(locale, `${base}.${n === 1 ? 'one' : 'other'}` as TKey, { n }),
    [locale],
  );

  /** Mensagens de erro podem ser chaves de tradução ou textos crus (ex.: vindos do onnxruntime). */
  const tError = useCallback((msg: string) => (isTKey(msg) ? translate(locale, msg) : msg), [locale]);

  const num = useCallback(
    (n: number, digits = 1) => n.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    [locale],
  );

  return { locale, t, tr, tn, tError, num };
}
