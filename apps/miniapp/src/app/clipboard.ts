// Буфер обмена: общий путь для кнопки «Скопировать» и запасного «Поделиться» вне MAX.

/**
 * Скопировать текст. Clipboard API вызываем синхронно из обработчика клика (иначе WebView может отказать),
 * запасной путь — старый execCommand через скрытое поле.
 */
export async function copyText(text: string): Promise<boolean> {
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
export function selectText(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
