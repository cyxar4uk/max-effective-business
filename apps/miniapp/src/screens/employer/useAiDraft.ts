// Запрос «Заполнить за меня» (AiDraft.tsx): по задаче своими словами сервер предлагает заголовок, направление,
// навыки, тип и формат (POST /api/internships/draft — GigaChat или ключевые слова). Работодатель проверяет и правит
// черновик по обычным шагам. Процент совпадения по-прежнему считает формула, ИИ в нём нет.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { haptic } from '../../max/bridge';
import { suggestionPatch, untouchedOnly, type Dict, type Draft } from './draft';

/** Короче — серверу не из чего собрать черновик (как в API). */
const MIN_BRIEF = 10;

export type AiDraftState =
  | { status: 'idle' }
  | { status: 'loading' }
  /** field — ошибка в самом тексте (подсветить поле), иначе — сервис. */
  | { status: 'error'; message: string; field: boolean }
  | { status: 'done'; source: 'ai' | 'rules' };

export interface AiDraftCtl {
  state: AiDraftState;
  run: () => void;
  /** Текст правят — прошлый результат или ошибка больше не про него. */
  reset: () => void;
}

const FAILED = 'Не получилось — заполните вручную';

function errorState(err: unknown): AiDraftState {
  if (!(err instanceof ApiError)) return { status: 'error', message: FAILED, field: false };
  // Лимит в час и ошибка в тексте — понятны работодателю как есть; остальное — общее «не получилось»
  if (err.code === 'RATE_LIMITED') return { status: 'error', message: err.message, field: false };
  if (err.code === 'VALIDATION_ERROR') return { status: 'error', message: err.fields.text ?? err.message, field: true };
  if (err.code === 'NETWORK') return { status: 'error', message: 'Нет связи с сервером — повторите или заполните вручную', field: false };
  return { status: 'error', message: FAILED, field: false };
}

/**
 * Запрос черновика живёт в форме, а не в шаге: на телефоне шаг 1 размонтируется по «Дальше», а ответ (до 12 с) всё
 * равно должен попасть в черновик. Применяем только поля, которые работодатель не трогал, пока ждал ответа.
 */
export function useAiDraft(draft: Draft, update: (patch: Partial<Draft>) => void, dict: Dict): AiDraftCtl {
  const [state, setState] = useState<AiDraftState>({ status: 'idle' });
  // Ответ приходит позже: нужны свежие черновик и update (он знает свежие поля), а не те, что были при нажатии
  const latest = useRef({ draft, update, dict });
  const alive = useRef(true);
  useEffect(() => {
    latest.current = { draft, update, dict };
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const fail = (next: AiDraftState) => {
    setState(next);
    haptic.notify('error');
  };

  // Двойное нажатие до перерисовки — один запрос
  const busy = useRef(false);

  const run = async () => {
    if (busy.current) return;
    const before = latest.current.draft;
    const text = before.brief.trim();
    if (text.length < MIN_BRIEF) {
      fail({ status: 'error', message: 'Опишите задачу чуть подробнее — хотя бы одним предложением', field: true });
      return;
    }
    haptic.impact('light');
    busy.current = true;
    setState({ status: 'loading' });
    try {
      const suggestion = await api.placeDraft(text);
      if (!alive.current) return;
      const now = latest.current;
      const full = suggestionPatch(suggestion, now.dict);
      if (!full.requiredSkills && !full.tags) {
        fail({ status: 'error', message: 'Не нашли знакомых задач в описании — заполните вручную', field: false });
        return;
      }
      const patch = untouchedOnly(full, before, now.draft);
      if (Object.keys(patch).length) now.update(patch);
      setState({ status: 'done', source: suggestion.source });
      haptic.notify('success');
    } catch (err) {
      if (alive.current) fail(errorState(err));
    } finally {
      busy.current = false;
    }
  };

  return {
    state,
    run: () => void run(),
    reset: () => {
      if (state.status === 'error' || state.status === 'done') setState({ status: 'idle' });
    },
  };
}
