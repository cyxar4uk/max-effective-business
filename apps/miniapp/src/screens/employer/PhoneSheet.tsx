// Шторка перед публикацией места, если у работодателя нет подтверждённого номера: без номера после «Это тандем!»
// студенту некуда позвонить. Мягкий барьер: опубликовать без номера можно всегда — и вне MAX, и если MAX не ответил.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { useMe } from '../../app/me';
import { haptic, insideMax, requestContact, type MaxContact } from '../../max/bridge';

interface Props {
  /** Номер получен или пользователь решил без него — публикуем. */
  onPublish: () => void;
  /** Закрыть шторку и остаться на проверке карточки. */
  onClose: () => void;
}

export function PhoneSheet({ onPublish, onClose }: Props) {
  const { setMe } = useMe();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Публикуем один раз: MAX может ответить номером уже после «Опубликовать без номера»
  const published = useRef(false);
  const publish = () => {
    if (published.current) return;
    published.current = true;
    onPublish();
  };
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);

  // Фокус — в шторку, после закрытия — обратно на кнопку, которая её открыла
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => opener?.focus?.();
  }, []);

  // Тот же запрос, что на шаге телефона в онбординге: MAX отдаёт номер с подписью, сервер её проверяет
  const share = async () => {
    setAsking(true);
    setNote(null);
    let contact: MaxContact;
    try {
      contact = await requestContact();
    } catch {
      setAsking(false);
      if (!published.current) setNote('Номер не получен. Можно опубликовать место без него.');
      return;
    }
    try {
      setMe(await api.phone(contact));
      haptic.notify('success');
      publish();
    } catch (err) {
      setAsking(false);
      if (published.current) return;
      haptic.notify('error');
      setNote(err instanceof ApiError ? err.message : 'Не получилось сохранить номер. Можно опубликовать место без него.');
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    // Фокус не уходит из шторки
    if (e.key !== 'Tab' || !dialog.current) return;
    const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="pf-modal" onKeyDown={onKeyDown}>
      <div className="pf-dim" aria-hidden="true" onClick={onClose} />
      <div className="sheet pf-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialog}>
        <span className="grab" aria-hidden="true" />
        <h2 className="h1 pf-sheet-t" id={titleId}>
          Номер телефона
        </h2>
        <p className="lead m0">Студент сможет позвонить вам только по номеру. Поделитесь номером — MAX подтвердит его одним нажатием.</p>
        <p className="lbl m0">Номер увидит только студент, которого вы пригласите. В карточке места его нет.</p>
        {!insideMax && <p className="lbl m0">Поделиться номером можно в приложении MAX.</p>}
        {note && (
          <p className="pf-alert" role="alert">
            {note}
          </p>
        )}
        <div className="actions">
          {insideMax && (
            <button type="button" className="btn pri" disabled={asking} onClick={() => void share()}>
              {asking ? 'Ждём номер от MAX…' : 'Поделиться номером'}
            </button>
          )}
          {/* Не блокируем: окно MAX с номером можно закрыть без ответа, и тогда запрос повиснет */}
          <button type="button" className={insideMax ? 'btn ghost' : 'btn pri'} onClick={publish}>
            Опубликовать без номера
          </button>
        </div>
      </div>
    </div>
  );
}
