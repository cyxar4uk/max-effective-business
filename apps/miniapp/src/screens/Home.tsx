import { useNavigate } from 'react-router';
import { haptic } from '../max/bridge';
import { CheckGuide } from './CheckGuide';

/** Главный: выбор роли. Проверяющий один — проходит обе роли одним аккаунтом. */
export function Home() {
  const navigate = useNavigate();

  const go = (path: string) => {
    haptic.selection();
    navigate(path);
  };

  return (
    <main className="screen">
      <section className="hero">
        <h1 className="h1">Найдите свой тандем</h1>
        <p className="lead">
          Работодатель находит студентов на практику и стажировку, студент — подходящие места. Роль можно сменить в
          любой момент.
        </p>
      </section>
      <div className="actions">
        <button type="button" className="btn pri" onClick={() => go('/employer')}>
          Я работодатель
        </button>
        <button type="button" className="btn sec" onClick={() => go('/student')}>
          Я студент
        </button>
        {/* Требование модерации MAX: ссылки на документы, реквизиты и поддержку видны в приложении */}
        <button type="button" className="btn ghost" onClick={() => go('/about')}>
          О сервисе
        </button>
      </div>
      <CheckGuide />
    </main>
  );
}
