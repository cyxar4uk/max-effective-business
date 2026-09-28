import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { getStartParam } from '../max/bridge';

let handled = false;

/**
 * Параметр запуска от бота (docs/api.md, for_ilya §4), разбирается один раз при открытии на главном:
 * `student` и `employer` — раздел роли вместо главного; `internship_<id>` — карточка места поверх главного,
 * чтобы «Назад» вела к выбору роли. Без параметра остаёмся на главном.
 */
export function StartParamRedirect() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

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
    }
  }, [navigate, pathname]);

  return null;
}
