import { Component, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { backTo } from './history';
import { ChunkLoadError, reloadApp } from './lazyScreen';

/** Не пришёл чанк экрана. Загрузчики помечают сбой сами (ChunkLoadError); текст — запасной путь для чужих ошибок. */
const isChunkError = (error: unknown) =>
  error instanceof ChunkLoadError ||
  (error instanceof Error &&
    /dynamically imported module|module script|Unable to preload CSS|Failed to fetch|Load failed|NetworkError/i.test(error.message));

interface BoundaryProps {
  children: ReactNode;
  /** Выход на главный; на самом главном его нет — переход на тот же адрес ничего бы не сменил. */
  onHome: (() => void) | null;
}

interface BoundaryState {
  error: unknown;
  /** «Повторить» не дозвался до сервера — перезагружать некуда, остаёмся здесь. */
  offline: boolean;
  busy: boolean;
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, offline: false, busy: false };

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { error: error ?? new Error('unknown'), offline: false };
  }

  retry = async () => {
    if (!isChunkError(this.state.error)) {
      // Ошибка отрисовки: пробуем нарисовать экран ещё раз
      this.setState({ error: null });
      return;
    }
    // Чанк: браузер помнит отказ до перезагрузки — перезагружаем приложение на этом же адресе
    this.setState({ busy: true });
    const reloading = await reloadApp();
    if (!reloading) this.setState({ offline: true, busy: false });
  };

  render() {
    const { error, offline, busy } = this.state;
    if (!error) return this.props.children;
    const network = isChunkError(error);
    // Ошибку не сбрасываем и при «На главный»: этот экран уходит со сменой адреса и не должен мелькнуть сломанным
    return (
      <main className="screen">
        <div className="state" role="alert">
          <h2 className="state-title d">{network ? 'Экран не загрузился' : 'Что-то пошло не так'}</h2>
          <p className="state-text">
            {offline
              ? 'Нет связи с сервером. Повторите, когда появится интернет.'
              : network
                ? 'Похоже, прервалась связь. Проверьте интернет и повторите.'
                : 'Повторите. Если не поможет — вернитесь на главный экран.'}
          </p>
          <button type="button" className="btn pri" onClick={this.retry} disabled={busy}>
            {busy ? 'Проверяем связь…' : 'Повторить'}
          </button>
          {this.props.onHome && (
            <button type="button" className="btn ghost" onClick={this.props.onHome}>
              На главный
            </button>
          )}
        </div>
      </main>
    );
  }
}

/**
 * Сбой экрана — не загрузился чанк (пропала сеть, выкатили новую версию) или ошибка при отрисовке: вместо белого экрана —
 * понятный текст, «Повторить» и выход на главный. «На главный» возвращает к главному в истории или заменяет запись:
 * «Назад» MAX не вернёт на сломанный экран и не поведёт с главного снова на главный.
 */
export function ScreenBoundary({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return <Boundary onHome={pathname === '/' ? null : () => backTo(navigate, '/')}>{children}</Boundary>;
}
