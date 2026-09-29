import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { Me } from '../api/types';
import { Skeleton } from '../components/Skeleton';
import { getStartParam } from '../max/bridge';
import { lastRole } from './lastRole';
import { useMe } from './me';
import { placeIdFromParam } from './placeParam';

/** Куда вести при запуске и как: поверх главного (push) или вместо него (replace). */
interface Target {
  to: string;
  replace: boolean;
}

/**
 * Параметр запуска от бота или диплинка (docs/api.md, for_ilya §4) всегда важнее последней роли:
 * - `internship_<id>` (QR-код на стенде, «Смотреть» и «Кандидаты» в боте, ссылка друга) — карточка места поверх
 *   главного, чтобы «Назад» вела к выбору роли; своё место карточка сама откроет списком кандидатов;
 * - `student` и `employer` — раздел роли вместо главного.
 * Без параметра — в раздел последней роли, если её профиль есть; иначе остаёмся на главном (выбор роли).
 * Разбираем только на главном: другой адрес при запуске — перезагрузка внутри приложения, остаёмся где были.
 */
function launchTarget(pathname: string, me: Me): Target | null {
  if (pathname !== '/') return null;
  const param = getStartParam();
  const placeId = placeIdFromParam(param);
  if (placeId !== null) return { to: `/internships/${placeId}`, replace: false };
  if (param === 'student' || param === 'employer') return { to: `/${param}`, replace: true };
  if (param) return null;
  const role = lastRole();
  return role && me.roles[role] ? { to: `/${role}`, replace: true } : null;
}

let handled = false;

/**
 * Разбор параметра запуска — один раз при открытии. Пока переход не случился, экраны не рисуем (та же заглушка,
 * что и при загрузке пользователя): главный при запуске по ссылке не мелькает, место открывается сразу.
 */
export function StartParamGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { me } = useMe();
  const [target] = useState(() => (handled ? null : launchTarget(pathname, me)));
  const [arrived, setArrived] = useState(target === null);

  useEffect(() => {
    if (handled) return;
    handled = true;
    if (target) navigate(target.to, { replace: target.replace });
  }, [navigate, target]);

  if (!arrived && target && pathname === target.to) setArrived(true);
  if (!arrived) {
    return (
      <main className="screen">
        <Skeleton lines={4} />
      </main>
    );
  }
  return <>{children}</>;
}
