import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../api/client';
import { useLoad } from '../api/useLoad';
import { DemoBadge } from '../components/DemoBadge';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';

const notFound = () => Promise.reject(new ApiError(404, 'NOT_FOUND', 'Место не найдено'));

/**
 * Карточка места (открывается и по параметру запуска `internship_<id>`).
 * Владельцу сразу показываем кандидатов — так работает кнопка «Кандидаты» из уведомления бота.
 * Пока заглушка: полная карточка с расшифровкой совпадения — отдельная задача.
 */
export function InternshipScreen() {
  const id = Number(useParams().id);
  const valid = Number.isInteger(id) && id > 0;
  const navigate = useNavigate();
  const [state, retry] = useLoad(() => (valid ? api.internship(id) : notFound()), [id]);
  const isOwner = state.status === 'ok' && state.data.isOwner === true;

  useEffect(() => {
    if (isOwner) navigate(`/employer/internships/${id}/candidates`, { replace: true });
  }, [isOwner, id, navigate]);

  if (!valid) return <Navigate to="/" replace />;

  if (state.status === 'loading' || isOwner) {
    return (
      <main className="screen">
        <Skeleton lines={3} height={120} />
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="screen">
        {state.error.code === 'NOT_FOUND' ? (
          <EmptyState
            title="Место не найдено"
            text="Возможно, его уже закрыли. Посмотрите другие подходящие места."
            actionLabel="К местам для вас"
            onAction={() => navigate('/student', { replace: true })}
          />
        ) : (
          <ErrorState error={state.error} onRetry={retry} />
        )}
      </main>
    );
  }

  const place = state.data;
  return (
    <main className="screen">
      <article className="stack-v place">
        <DemoBadge isDemo={place.isDemo} />
        <h1 className="h1">{place.title}</h1>
        <p className="lead">
          {place.company.name} · {place.city ?? place.company.city}
        </p>
        {place.match && (
          <p className="pct m0">
            {place.match.score}
            <small>%</small>
          </p>
        )}
      </article>
    </main>
  );
}
