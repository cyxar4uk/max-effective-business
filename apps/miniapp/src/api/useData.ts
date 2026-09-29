import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './client';
import type { LoadState } from './useLoad';

const toApiError = (err: unknown): ApiError =>
  err instanceof ApiError ? err : new ApiError(0, 'INTERNAL', 'Что-то пошло не так. Повторите попытку.');

interface Request {
  n: number;
  /** Тихое обновление: пока идёт запрос, на экране старые данные, ошибка их не затирает. */
  silent: boolean;
}

interface Result<T> {
  key: string;
  n: number;
  state: LoadState<T>;
}

export interface DataHandle<T> {
  state: LoadState<T>;
  /** Загрузить заново со скелетоном (кнопка «Повторить»). */
  retry: () => void;
  /** Обновить в фоне, не пряча то, что на экране. */
  refresh: () => void;
  /** Поправить загруженные данные ответом сервера (приглашение, закрытие места) без перезагрузки. */
  update: (change: (data: T) => T) => void;
}

/**
 * Как useLoad, но для экранов, где данные меняются на месте: тихое обновление и правка ответом сервера.
 * deps — простые значения (id из адреса): при их смене данные грузятся заново.
 */
export function useData<T>(load: () => Promise<T>, deps: readonly unknown[]): DataHandle<T> {
  const key = JSON.stringify(deps);
  const [req, setReq] = useState<Request>({ n: 0, silent: false });
  const [res, setRes] = useState<Result<T> | null>(null);

  useEffect(() => {
    let alive = true;
    load().then(
      (data) => alive && setRes({ key, n: req.n, state: { status: 'ok', data } }),
      (err: unknown) =>
        alive &&
        setRes((prev) =>
          // Тихое обновление не удалось — оставляем то, что уже показано
          req.silent && prev?.key === key && prev.state.status === 'ok'
            ? { ...prev, n: req.n }
            : { key, n: req.n, state: { status: 'error', error: toApiError(err) } },
        ),
    );
    return () => {
      alive = false;
    };
    // load пересоздаётся на каждом рендере — перезапуск задают key и номер запроса
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, req]);

  const retry = useCallback(() => setReq((r) => ({ n: r.n + 1, silent: false })), []);
  const refresh = useCallback(() => setReq((r) => ({ n: r.n + 1, silent: true })), []);
  const update = useCallback(
    (change: (data: T) => T) =>
      setRes((prev) => (prev && prev.state.status === 'ok' ? { ...prev, state: { status: 'ok', data: change(prev.state.data) } } : prev)),
    [],
  );

  let state: LoadState<T> = { status: 'loading' };
  if (res && res.key === key && (req.silent || res.n === req.n)) state = res.state;
  return { state, retry, refresh, update };
}
