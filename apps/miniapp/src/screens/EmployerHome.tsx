import { Navigate } from 'react-router';
import { useMe } from '../app/me';
import { Places } from './employer/Places';

/** Раздел работодателя — «Мои места». Без профиля компании — сначала он, после сохранения откроется форма места. */
export function EmployerHome() {
  const { me } = useMe();
  if (!me.roles.employer) return <Navigate to="/employer/profile" replace />;
  return <Places />;
}
