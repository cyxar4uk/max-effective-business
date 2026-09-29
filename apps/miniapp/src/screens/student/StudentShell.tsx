import type { ReactNode } from 'react';
import { Navigate, NavLink, useLocation } from 'react-router';
import { useMe } from '../../app/me';
import { Icon } from './ui';

/** Нижняя навигация студента; на десктопе — колонка слева. */
function StudentNav() {
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : undefined);
  return (
    <nav className="nav st-nav" aria-label="Разделы студента">
      <NavLink to="/student" end className={cls}>
        <Icon name="cards" />
        Места
      </NavLink>
      <NavLink to="/student/interests" className={cls}>
        <Icon name="heart" />
        Отклики
      </NavLink>
      <NavLink to="/student/profile" end className={cls}>
        <Icon name="user" />
        Профиль
      </NavLink>
    </nav>
  );
}

/** Каркас раздела студента: контент и навигация. Без навигации — для анкеты и онбординга. */
export function StudentShell({ children }: { children: ReactNode }) {
  return (
    <div className="st-shell">
      <div className="st-main">{children}</div>
      <StudentNav />
    </div>
  );
}

/** Раздел студента только после согласия на обработку ПД: иначе — онбординг с возвратом сюда же. */
export function RequireConsent({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const { pathname, search } = useLocation();
  if (!me.consent) {
    const next = encodeURIComponent(pathname + search).replace(/%2F/gi, '/');
    return <Navigate to={`/consent?next=${next}`} replace />;
  }
  return <>{children}</>;
}
