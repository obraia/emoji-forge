import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Texto secundário à direita (ex.: código do idioma). */
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Ícone fixo no início do botão. */
  icon?: ReactNode;
  ariaLabel: string;
  title?: string;
  className?: string;
  /** Alinhamento do menu em relação ao botão. */
  align?: 'start' | 'end';
  disabled?: boolean;
}

/**
 * Select customizado seguindo o padrão ARIA "select-only combobox":
 * o foco fica no botão e a opção ativa é indicada por aria-activedescendant.
 */
export function Select<T extends string>(props: SelectProps<T>) {
  const { value, options, onChange, icon, ariaLabel, title, className = '', align = 'start', disabled } = props;
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: '', timer: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [dropUp, setDropUp] = useState(false);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  const enabledIndexes = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const step = (from: number, dir: 1 | -1) => {
    if (!enabledIndexes.length) return -1;
    const pos = enabledIndexes.indexOf(from);
    if (pos === -1) return dir === 1 ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1];
    return enabledIndexes[Math.min(enabledIndexes.length - 1, Math.max(0, pos + dir))];
  };

  const openMenu = (index = selectedIndex) => {
    if (disabled) return;
    setActive(index >= 0 && !options[index]?.disabled ? index : step(-1, 1));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  const choose = (index: number) => {
    const opt = options[index];
    if (!opt || opt.disabled) return;
    if (opt.value !== value) onChange(opt.value);
    close();
  };

  // Abre para cima quando não há espaço abaixo
  useLayoutEffect(() => {
    if (!open || !rootRef.current || !listRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const h = listRef.current.offsetHeight;
    setDropUp(window.innerHeight - rect.bottom < h + 12 && rect.top > h + 12);
  }, [open]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Mantém a opção ativa visível
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onTypeahead = (key: string) => {
    const ta = typeahead.current;
    clearTimeout(ta.timer);
    ta.text += key.toLowerCase();
    ta.timer = window.setTimeout(() => (ta.text = ''), 600);
    const start = open ? active : selectedIndex;
    const order = [...options.keys()].map((k) => (k + start + 1) % options.length);
    const match = order.find((i) => !options[i].disabled && options[i].label.toLowerCase().startsWith(ta.text));
    if (match === undefined) return;
    if (open) setActive(match);
    else onChange(options[match].value);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openMenu();
        else setActive((a) => step(a, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openMenu();
        else setActive((a) => step(a, -1));
        break;
      case 'Home':
        if (!open) return;
        e.preventDefault();
        setActive(enabledIndexes[0] ?? -1);
        break;
      case 'End':
        if (!open) return;
        e.preventDefault();
        setActive(enabledIndexes[enabledIndexes.length - 1] ?? -1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (open) choose(active);
        else openMenu();
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        break;
      case 'Tab':
        if (open) close(false);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) onTypeahead(e.key);
    }
  };

  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;

  return (
    <div ref={rootRef} className={`select ${open ? 'open' : ''} ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        title={title}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
      >
        {icon && <span className="select-icon">{icon}</span>}
        {selected?.icon && <span className="select-icon">{selected.icon}</span>}
        <span className="select-value">{selected?.label ?? ''}</span>
        <ChevronDown size={14} className="select-chevron" />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className={`select-menu ${align === 'end' ? 'align-end' : ''} ${dropUp ? 'drop-up' : ''}`}
          tabIndex={-1}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={optionId(i)}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              className={`select-option ${i === active ? 'active' : ''} ${o.value === value ? 'selected' : ''}`}
              onPointerMove={() => !o.disabled && active !== i && setActive(i)}
              // Evita que o botão perca o foco ao clicar na opção
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              {o.icon && <span className="select-icon">{o.icon}</span>}
              <span className="select-option-label">{o.label}</span>
              {o.hint && <span className="select-option-hint">{o.hint}</span>}
              <Check size={15} className="select-check" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
