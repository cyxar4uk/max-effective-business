import { useNavigate } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { RequireConsent, StudentShell } from './StudentShell';

/** «Мои отклики» студента — заглушка: сам экран со статусами и контактами делает задача #16. */
export function StudentInterests() {
  const navigate = useNavigate();
  return (
    <RequireConsent>
      <StudentShell>
        <main className="sp">
          <div className="top sp-top">
            <h1 className="d m0 feed-h1">Отклики</h1>
          </div>
          <EmptyState
            title="Скоро"
            text="Здесь будут ваши отклики со статусами. О приглашении бот сразу напишет вам в чат — с контактом компании."
            actionLabel="Смотреть места"
            onAction={() => navigate('/student')}
          />
        </main>
      </StudentShell>
    </RequireConsent>
  );
}
