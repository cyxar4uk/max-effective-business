import { Navigate, useNavigate } from 'react-router';
import { useMe } from '../app/me';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { PlusIcon } from './employer/icons';

/** Раздел работодателя. Пока заглушка: «Мои места» — следующая задача. */
export function EmployerHome() {
  const { me } = useMe();
  const navigate = useNavigate();

  // Без профиля компании — сразу к нему, после сохранения он откроет форму места
  if (!me.roles.employer) return <Navigate to="/employer/profile" replace />;

  return (
    <main className="screen">
      <PageHeader title="Сводка" />
      <div className="actions">
        <button type="button" className="btn pri" onClick={() => navigate('/employer/new')}>
          <PlusIcon />
          Новое место
        </button>
        <button type="button" className="btn ghost" onClick={() => navigate('/employer/profile')}>
          Профиль компании
        </button>
      </div>
      <EmptyState title="Сводка скоро появится" text="Здесь будут ваши места и отклики студентов." />
    </main>
  );
}
