import { useEffect, useState } from 'react';

const EVENT = 'tandem:flash';

/** Подтверждение успеха, которое переживает переход: «Анкета сохранена» видно уже на экране, куда вернулись. */
export function flash(text: string): void {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: text }));
}

/** Плашка подтверждения сверху экрана; одна на приложение (App.tsx), живёт 2,6 с. */
export function FlashHost() {
  const [message, setMessage] = useState<{ text: string; n: number } | null>(null);

  useEffect(() => {
    const onFlash = (e: Event) => setMessage((m) => ({ text: (e as CustomEvent<string>).detail, n: (m?.n ?? 0) + 1 }));
    window.addEventListener(EVENT, onFlash);
    return () => window.removeEventListener(EVENT, onFlash);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <div className="flash-host" aria-live="polite">
      {message && (
        <p key={message.n} className="flash">
          <svg className="ic sm" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          {message.text}
        </p>
      )}
    </div>
  );
}
