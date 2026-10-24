// Решение по кандидату с отменой: «Пригласить» и «Отказать» уходят на сервер через 5 секунд, до этого — «Отменить».
// Приглашение необратимо (бот сразу шлёт контакты), поэтому окно отмены — до запроса, а не после.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Candidate } from '../../api/types';

export type Decision = 'invite' | 'decline';

/** Сколько висит тост «Отменить», мс. */
export const UNDO_MS = 5000;

export interface Pending {
  placeId: number;
  candidate: Candidate;
  action: Decision;
  /** Номер решения: перезапускает отсчёт тоста, если следующее решение приняли сразу за предыдущим. */
  n: number;
}

interface Handlers {
  /**
   * Сервер принял решение. mounted = false — экран уже закрыт (решение ушло при уходе), показывать нечего.
   * waiting = true — к ответу уже идёт отсчёт следующего решения: уводить с экрана нельзя, иначе оно уйдёт без отмены.
   */
  onDone: (result: Candidate, action: Decision, mounted: boolean, waiting: boolean) => void;
  onError: (error: ApiError) => void;
}

const toApiError = (err: unknown): ApiError =>
  err instanceof ApiError ? err : new ApiError(0, 'INTERNAL', 'Что-то пошло не так. Повторите попытку.');

let counter = 0;

export interface DecisionHandle {
  /** Решение в отсчёте: виден тост «Отменить». */
  pending: Pending | null;
  /** Решение ушло на сервер, ответа ещё нет: кнопки этого кандидата пока недоступны. */
  sending: Pending | null;
  /** Принять решение: тост с отменой, запрос — через UNDO_MS. Предыдущее решение в отсчёте уходит сразу. */
  decide: (placeId: number, candidate: Candidate, action: Decision) => void;
  /** «Отменить» в тосте. */
  cancel: () => void;
  /** Отправить решение в отсчёте сейчас же. */
  flush: () => void;
}

export function useDecision(handlers: Handlers): DecisionHandle {
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState<Pending | null>(null);
  const current = useRef<Pending | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(false);
  const latest = useRef(handlers);

  useEffect(() => {
    latest.current = handlers;
  });

  const send = useCallback((p: Pending, keepalive: boolean) => {
    const call = p.action === 'invite' ? api.invite : api.decline;
    const settle = () => {
      if (mounted.current) setSending((s) => (s?.n === p.n ? null : s));
    };
    if (mounted.current) setSending(p);
    call(p.placeId, p.candidate.studentId, { keepalive }).then(
      (result) => {
        settle();
        latest.current.onDone(result, p.action, mounted.current, current.current !== null);
      },
      (err: unknown) => {
        settle();
        if (mounted.current) latest.current.onError(toApiError(err));
      },
    );
  }, []);

  const release = useCallback(
    (keepalive: boolean) => {
      const p = current.current;
      if (!p) return;
      window.clearTimeout(timer.current);
      current.current = null;
      if (mounted.current) setPending(null);
      send(p, keepalive);
    },
    [send],
  );

  const decide = useCallback(
    (placeId: number, candidate: Candidate, action: Decision) => {
      release(false);
      const p: Pending = { placeId, candidate, action, n: ++counter };
      current.current = p;
      setPending(p);
      timer.current = window.setTimeout(() => release(false), UNDO_MS);
    },
    [release],
  );

  const cancel = useCallback(() => {
    window.clearTimeout(timer.current);
    current.current = null;
    setPending(null);
  }, []);

  const flush = useCallback(() => release(false), [release]);

  useEffect(() => {
    mounted.current = true;
    // Мини-приложение сворачивают или закрывают — решение уходит сразу и доживает до сервера (keepalive)
    const onHide = () => release(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') release(true);
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      mounted.current = false;
      // Ушли с экрана во время отсчёта — отправляем сразу
      release(true);
    };
  }, [release]);

  return { pending, sending, decide, cancel, flush };
}
