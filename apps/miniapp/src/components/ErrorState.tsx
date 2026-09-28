import type { ApiError } from '../api/client';

interface ErrorStateProps {
  error: ApiError;
  onRetry: () => void;
}

/** Ошибка загрузки: текст сервера как есть и повтор. */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const hint =
    error.code === 'UNAUTHORIZED'
      ? 'Закройте мини-приложение и откройте его снова из чата с ботом.'
      : 'Проверьте интернет и повторите.';
  return (
    <div className="state" role="alert">
      <h2 className="state-title d">Не получилось загрузить</h2>
      <p className="state-text">{error.message}</p>
      <p className="state-text lbl">{hint}</p>
      <button type="button" className="btn pri" onClick={onRetry}>
        Повторить
      </button>
    </div>
  );
}
