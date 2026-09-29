import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { getStartParam } from '../max/bridge';
import { lastRole } from './lastRole';
import { useMe } from './me';

let handled = false;

/**
 * Параметр запуска от бота (docs/api.md, for_ilya §4), разбирается один раз при открытии на главном:
 * `student` и `employer` — раздел роли вместо главного; `internship_<id>` — карточка места поверх главного,
 * чтобы «Назад» вела к выбору роли. Без параметра — в раздел последней роли, если её профиль есть;
 * иначе остаёмся на главном (выбор роли — при первом входе).
 */
export function StartParamRedirect() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { me } = useMe();

  useEffect(() => {
    if (handled) return;
    handled = true;
    if (pathname !== '/') return;

    const param = getStartParam();
    if (param === 'student') navigate('/student', { replace: true });
    else if (param === 'employer') navigate('/employer', { replace: true });
    else {
      const id = /^internship_(\d+)$/.exec(param)?.[1];
      if (id) navigate(`/internships/${id}`);
      else if (!param) {
        const role = lastRole();
        if (role && me.roles[role]) navigate(`/${role}`, { replace: true });
      }
    }
  }, [navigate, pathname, me]);

  return null;
}
