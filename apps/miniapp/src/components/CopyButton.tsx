import { useEffect, useState, type RefObject } from 'react';
import { copyText, selectText } from '../app/clipboard';
import { haptic } from '../max/bridge';

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
