import { Component, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { resetLazyScreens } from './lazyScreen';

/** Не пришёл чанк экрана: формулировки браузеров — Chrome, Safari, Firefox. */
const isChunkError = (error: unknown) =>
  error instanceof Error && /dynamically imported module|module script|Failed to fetch|Load failed|NetworkError/i.test(error.message);

interface BoundaryProps {
  children: ReactNode;
  onHome: () => void;
}

interface BoundaryState {
  error: unknown;
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: error ?? new Error('unknown') };
  }

  retry = () => {
    resetLazyScreens();
    this.setState({ error: null });
  };

  home = () => {
    resetLazyScreens();
    this.setState({ error: null });
    this.props.onHome();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const network = isChunkError(error);
    return (
      <main className="screen">
        <div className="state" role="alert">
          <h2 className="state-title d">{network ? 'Экран не загрузился' : 'Что-то пошло не так'}</h2>
          <p className="state-text">
            {network
              ? 'Похоже, прервалась связь. Проверьте интернет и повторите.'
              : 'Повторите. Если не поможет — вернитесь на главный экран.'}
          </p>
          <button type="button" className="btn pri" onClick={this.retry}>
            Повторить
          </button>
          <button type="button" className="btn ghost" onClick={this.home}>
            На главный
          </button>
        </div>
      </main>
    );
  }
}

/**
 * Сбой экрана — не загрузился чанк (пропала сеть) или ошибка при отрисовке: вместо белого экрана — понятный текст,
 * «Повторить» (чанк запрашивается заново) и выход на главный. Перезапускать приложение не нужно.
 */
export function ScreenBoundary({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return <Boundary onHome={() => navigate('/')}>{children}</Boundary>;
}
