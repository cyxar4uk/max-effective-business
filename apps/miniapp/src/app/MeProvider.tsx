import { useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { Me } from '../api/types';
import { useLoad } from '../api/useLoad';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { MeContext } from './me';

/** Сначала GET /api/me: без пользователя экраны не рисуем. */
export function MeProvider({ children }: { children: ReactNode }) {
  const [state, retry] = useLoad(api.me, []);
  // Ответы POST /api/me/consent, /me/phone приходят в формате /api/me — ими обновляем без перезагрузки
  const [updated, setMe] = useState<Me | null>(null);

  if (state.status === 'error' && !updated) {
    return (
      <main className="screen">
        <ErrorState error={state.error} onRetry={retry} />
      </main>
    );
  }
  const me = updated ?? (state.status === 'ok' ? state.data : null);
  if (!me) {
    return (
      <main className="screen">
        <Skeleton lines={4} />
      </main>
    );
  }
  return <MeContext.Provider value={{ me, setMe }}>{children}</MeContext.Provider>;
}
