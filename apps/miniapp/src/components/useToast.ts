import { useCallback, useEffect, useState } from 'react';

export interface ToastValue {
  text: string;
  kind: 'ok' | 'error';
}

/** Тост с автоскрытием: подтверждение — 2,6 с, ошибка — 5 с (как в ленте студента). */
export function useToast(): [ToastValue | null, (toast: ToastValue | null) => void] {
  const [toast, setToast] = useState<ToastValue | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.kind === 'error' ? 5000 : 2600);
    return () => window.clearTimeout(t);
  }, [toast]);
  const show = useCallback((next: ToastValue | null) => setToast(next), []);
  return [toast, show];
}
