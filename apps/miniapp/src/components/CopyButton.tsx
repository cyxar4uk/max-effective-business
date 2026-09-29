import { useEffect, useState, type RefObject } from 'react';
import { haptic } from '../max/bridge';

/**
 * Скопировать текст. Clipboard API вызываем синхронно из обработчика клика (иначе WebView может отказать),
 * запасной путь — старый execCommand через скрытое поле.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // WebView может запретить доступ к буферу — пробуем запасной путь
  }
  const active = document.activeElement as HTMLElement | null;
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.setAttribute('aria-hidden', 'true');
    Object.assign(field.style, { position: 'fixed', top: '0', left: '0', opacity: '0', pointerEvents: 'none' });
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length); // iOS не выделяет по select()
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  } catch {
    return false;
  } finally {
    active?.focus?.({ preventScroll: true });
  }
}

/** Выделить текст элемента, чтобы пользователь скопировал его сам. */
function selectText(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

interface CopyButtonProps {
  text: string;
  /** Где показан текст: если скопировать не вышло, выделяем его. */
  target: RefObject<HTMLElement | null>;
  className?: string;
  label?: string;
}

/**
 * Кнопка «Скопировать» (номер телефона и т. п.): tel: в MAX может не открыться, а скопировать можно всегда.
 * Не вышло — выделяем текст и просим скопировать вручную.
 */
export function CopyButton({ text, target, className = 'btn sec sm', label = 'Скопировать' }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'selected'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = window.setTimeout(() => setState('idle'), 2500);
    return () => window.clearTimeout(t);
  }, [state]);

  const copy = async () => {
    if (await copyText(text)) {
      haptic.notify('success');
      setState('copied');
    } else {
      if (target.current) selectText(target.current);
      haptic.notify('warning');
      setState('selected');
    }
  };

  return (
    <button type="button" className={className} onClick={copy}>
      <span aria-live="polite">{state === 'copied' ? 'Скопировано' : state === 'selected' ? 'Выделили — скопируйте' : label}</span>
    </button>
  );
}
