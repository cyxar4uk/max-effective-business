import { useNavigate, useParams } from 'react-router';
import { api } from '../api/client';
import type { Candidate } from '../api/types';
import { useLoad } from '../api/useLoad';
import { DemoBadge } from '../components/DemoBadge';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';

const STATUS: Record<Candidate['status'], { label: string; cls: string }> = {
  interested: { label: 'Откликнулся', cls: 'wait' },
  invited: { label: 'Приглашён', cls: 'ok' },
  declined: { label: 'Отказ', cls: 'no' },
};

/** Кандидаты на место по убыванию совпадения. Пока заглушка: приглашение и расшифровка — отдельная задача. */
export function CandidatesScreen() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const [state, retry] = useLoad(() => api.candidates(id), [id]);

  return (
    <main className="screen">
      <header className="page-head">
        <h1 className="h1">Кандидаты</h1>
      </header>
      {state.status === 'loading' ? (
        <Skeleton lines={4} />
      ) : state.status === 'error' ? (
        <ErrorState error={state.error} onRetry={retry} />
      ) : state.data.items.length === 0 ? (
        <EmptyState
          title="Пока нет откликов"
          text="Студенты с подходящими навыками получат уведомление о месте. Очное место в городе, где нет студентов из тестовых данных, может остаться без откликов."
          actionLabel="К сводке"
          onAction={() => navigate('/employer')}
        />
      ) : (
        <div className="surf">
          {state.data.items.map((c) => (
            <div key={c.studentId} className="li">
              <div className="col grow">
                <strong>{[c.firstName, c.lastName].filter(Boolean).join(' ')}</strong>
                <span className="lbl">
                  {c.university}, {c.course} курс · {c.city}
                </span>
                <div className="row">
                  <span className={`st ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>
                  <DemoBadge isDemo={c.isDemo} />
                </div>
              </div>
              <span className="pct pct-sm">
                {c.match.score}
                <small>%</small>
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
