import { useLocation, useNavigate } from 'react-router';
import type { ApiError } from '../api/client';
import { ABOUT } from '../app/about';
import { openMaxLink } from '../max/bridge';

interface ErrorStateProps {
  error: ApiError;
  onRetry: () => void;
  /** Показать выход на главный (по умолчанию — везде, кроме самого главного и экрана до загрузки пользователя).
   *  Переход заменяет запись в истории: «Назад» MAX не вернёт на экран с ошибкой. */
  exit?: boolean;
}

const openBot = () => openMaxLink(`https://max.ru/${ABOUT.botNick}?start=`);

/**
 * Ошибка загрузки: текст сервера как есть, «Повторить» и выход на главный — чтобы после ошибки можно было продолжить
 * без перезапуска. 401 (данные запуска устарели) — отдельный экран: помогает только открыть приложение заново из бота.
 */
export function ErrorState({ error, onRetry, exit = true }: ErrorStateProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const showExit = exit && pathname !== '/';

  if (error.code === 'UNAUTHORIZED') {
    return (
      <div className="state" role="alert">
        <span className="state-ic" aria-hidden="true">
          <svg className="ic" viewBox="0 0 24 24">
            <rect x="5" y="10" width="14" height="10" rx="2.5" />
            <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
          </svg>
        </span>
        <h2 className="state-title d">Откройте приложение заново из бота</h2>
        <p className="state-text">
          Данные запуска устарели — так MAX защищает ваш аккаунт. Закройте мини-приложение и откройте его снова из чата
          с ботом: всё, что вы сохранили, на месте.
        </p>
        {/* «Повторить» здесь нет: данные запуска читаются один раз, повтор дал бы тот же 401 */}
        <button type="button" className="btn pri" onClick={openBot}>
          Открыть бота
        </button>
      </div>
    );
  }

  // Что делать, сервер пишет в message сам («Повторите позже»); без сети — клиент (api/client.ts)
  return (
    <div className="state" role="alert">
      <h2 className="state-title d">Не получилось загрузить</h2>
      <p className="state-text">{error.message}</p>
      <button type="button" className="btn pri" onClick={onRetry}>
        Повторить
      </button>
      {showExit && (
        <button type="button" className="btn ghost" onClick={() => navigate('/', { replace: true })}>
          На главный
        </button>
      )}
    </div>
  );
}
