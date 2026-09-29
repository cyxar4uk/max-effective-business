// Последняя открытая роль: при следующем входе без параметра запуска — сразу в её раздел (решение Ильи, 29.09).
import { useEffect } from 'react';
import { useLocation } from 'react-router';

export type Role = 'student' | 'employer';

const KEY = 'tandem.lastRole';

export function lastRole(): Role | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'student' || value === 'employer' ? value : null;
  } catch {
    return null;
  }
}

function rememberRole(role: Role): void {
  try {
    localStorage.setItem(KEY, role);
  } catch {
    // Хранилище недоступно (приватный режим) — просто покажем выбор роли
  }
}

/** Запоминает роль по разделу, который открыт сейчас. */
export function LastRoleSync() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith('/student')) rememberRole('student');
    else if (pathname.startsWith('/employer')) rememberRole('employer');
  }, [pathname]);
  return null;
}
