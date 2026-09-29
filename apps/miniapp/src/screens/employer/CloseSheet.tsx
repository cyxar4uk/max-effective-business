// «Закрыть набор?» — шторка (макет c3 CloseSheet): закрываем место и, если включено, отказываем тем, кто ждёт решения.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { haptic } from '../../max/bridge';
import { withCandidate, type PlaceData } from './candidate';
import { plural } from './draft';
import { PlaceArt } from './PlaceArt';

interface Props {
  data: PlaceData;
  /** Кандидат, решение по которому уже ушло на сервер: его не трогаем. */
  skip: number | null;
  onClose: () => void;
  /** Место закрыто. declined — скольким отказали; failed — текст, если часть отказов не ушла. */
  onDone: (next: PlaceData, declined: number, failed: string | null) => void;
}

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export function CloseSheet({ data, skip, onClose, onDone }: Props) {
  const waiting = data.items.filter((c) => c.status === 'interested' && c.studentId !== skip);
  const [declineAll, setDeclineAll] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const switchId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const busy = progress !== null;

  // Фокус — в шторку, после закрытия — обратно на кнопку, которая её открыла
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const submit = async () => {
    setError(null);
    const total = declineAll ? waiting.length : 0;
    setProgress({ done: 0, total });
    let next: PlaceData;
    try {
      const place = await api.updateInternship(data.place.id, { status: 'closed' });
      next = { ...data, place: { ...data.place, ...place } };
    } catch (err) {
      haptic.notify('error');
      setError(message(err, 'Не получилось закрыть набор. Повторите попытку.'));
      setProgress(null);
      return;
    }
    // Отказы — по одному: сервер принимает решение по каждому кандидату отдельно
    let declined = 0;
    let failed: string | null = null;
    for (const c of total > 0 ? waiting : []) {
      try {
        next = withCandidate(next, await api.decline(data.place.id, c.studentId));
        declined += 1;
        setProgress({ done: declined, total });
      } catch (err) {
        failed = message(err, 'Часть отказов не отправилась.');
      }
    }
    haptic.notify(failed ? 'warning' : 'success');
    onDone(next, declined, failed);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !busy) {
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

  const n = waiting.length;
  return (
    <div className="cd-modal" onKeyDown={onKeyDown}>
      <div className="cd-dim" aria-hidden="true" onClick={() => !busy && onClose()} />
      <div className="sheet cd-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialog}>
        <span className="grab" aria-hidden="true" />
        <div className="cd-sheet-place">
          <span className="thumb cd-thumb sm">
            <PlaceArt place={data.place} variant="thumb" />
          </span>
          <span className="lbl grow">{data.place.title}</span>
        </div>
        <h2 className="h1 cd-sheet-t" id={titleId}>
          Закрыть набор?
        </h2>
        <p className="lead m0">Место пропадёт из ленты студентов и рассылки бота, новые отклики не придут.</p>
        {n > 0 && (
          <div className="cd-switch">
            <span className="col grow" id={switchId}>
              <span className="cd-switch-t">
                Отказать {n} {plural(n, ['кандидату', 'кандидатам', 'кандидатам'])}, {n === 1 ? 'который ждёт' : 'которые ждут'}{' '}
                решения
              </span>
              <span className="lbl">Они увидят отказ в «Моих откликах». Приглашённых не трогаем.</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={declineAll}
              aria-labelledby={switchId}
              className={declineAll ? 'toggle on' : 'toggle'}
              disabled={busy}
              onClick={() => {
                haptic.selection();
                setDeclineAll((v) => !v);
              }}
            >
              <i />
            </button>
          </div>
        )}
        <p className="lbl m0">Открыть снова можно в любой момент, если открытых мест меньше 20.</p>
        {error && (
          <p className="pf-alert" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn neg" disabled={busy} onClick={() => void submit()} aria-live="polite">
            {!progress
              ? 'Закрыть набор'
              : progress.total > 0 && progress.done > 0
                ? `Отказываем: ${progress.done} из ${progress.total}…`
                : 'Закрываем…'}
          </button>
          <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
