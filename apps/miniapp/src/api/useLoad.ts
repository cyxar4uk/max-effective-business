import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './client';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ok'; data: T };

const LOADING = { status: 'loading' } as const;

const toApiError = (err: unknown): ApiError =>
  err instanceof ApiError ? err : new ApiError(0, 'INTERNAL', 'Что-то пошло не так. Повторите попытку.');

/**
 * Загрузка данных экрана: состояние (загрузка / ошибка / данные) и повтор по кнопке.
 * deps — простые значения (id из адреса и т. п.): при их смене данные грузятся заново.
 */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]): [LoadState<T>, () => void] {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([...deps, attempt]);
  const [result, setResult] = useState<{ key: string; state: LoadState<T> } | null>(null);

  useEffect(() => {
    let alive = true;
    load().then(
      (data) => alive && setResult({ key, state: { status: 'ok', data } }),
      (err: unknown) => alive && setResult({ key, state: { status: 'error', error: toApiError(err) } }),
    );
    return () => {
      alive = false;
    };
    // load пересоздаётся на каждом рендере — перезапуск задаёт key (deps + номер попытки)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [result?.key === key ? result.state : LOADING, retry];
}
