// Студент узнаёт о приглашении, не заходя в «Отклики»: после «Интересно» опрашиваем отклики, пока открыт экран.
// Демо-компания приглашает примерно через 20 секунд, обычная — когда решит; бот в чат пишет в любом случае.
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { api } from '../../api/client';
import type { Interest } from '../../api/types';
import { createInviteWatcher, type InviteWatcher } from './invitePoll';
import { inviteSeen, onInviteSeen } from './tandem';

/* Приглашения, замеченные опросом: бейдж на вкладке «Отклики», пока их не открыли. */
const noticed = new Set<number>();
const listeners = new Set<() => void>();
let count = 0;

function recount() {
  const next = [...noticed].filter((id) => !inviteSeen(id)).length;
  if (next === count) return;
  count = next;
  for (const l of listeners) l();
}

onInviteSeen(recount);

/** «Отклики» открыты — бейдж больше не нужен. */
export function clearNoticedInvites(): void {
  noticed.clear();
  recount();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Сколько новых приглашений показать бейджем на вкладке «Отклики». */
export const useNoticedInvites = (): number => useSyncExternalStore(subscribe, () => count);

/**
 * Наблюдение за откликами, пока экран открыт: watch(id) после успешного «Интересно»;
 * на приглашение — onInvited (тост с переходом) и бейдж на «Откликах». Уже просмотренные не показываем.
 */
export function useInviteWatch(onInvited: (interest: Interest) => void): (placeId: number) => void {
  const handler = useRef(onInvited);
  const watcher = useRef<InviteWatcher | null>(null);
  useEffect(() => {
    handler.current = onInvited;
  });
  useEffect(() => {
    const w = createInviteWatcher({
      load: async () => (await api.interests()).items,
      onInvited: (i) => {
        if (inviteSeen(i.internship.id)) return;
        noticed.add(i.internship.id);
        recount();
        handler.current(i);
      },
    });
    watcher.current = w;
    return () => {
      w.stop();
      watcher.current = null;
    };
  }, []);
  return useCallback((placeId: number) => watcher.current?.watch(placeId), []);
}
