import { useNavigate } from 'react-router';
import { haptic } from '../max/bridge';
import { CheckGuide } from './CheckGuide';
import { InfoIcon } from './employer/icons';

/** Главный: выбор роли (макет c3 Main). Проверяющий один — проходит обе роли одним аккаунтом. */
export function Home() {
  const navigate = useNavigate();

  const go = (path: string) => {
    haptic.selection();
    navigate(path);
  };

  return (
    <main className="screen home">
      <header className="top home-top">
        <span className="d home-mark">тандем</span>
        {/* Требование модерации MAX: документы, реквизиты и поддержка — в «О сервисе», вход виден на главном */}
        <button type="button" className="ibtn" aria-label="О сервисе" onClick={() => go('/about')}>
          <InfoIcon className="ic sm" />
        </button>
      </header>
      <section className="home-hero">
        <div className="orb home-orb" aria-hidden="true">
          <i className="a" />
          <i className="b" />
          <span className="ck">
            <svg className="ic" viewBox="0 0 24 24" style={{ strokeWidth: 2.6 }}>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        </div>
        <div className="home-text">
          <h1 className="d m0 home-h1">Найдите свой тандем</h1>
          <p className="m0 home-sub">Практиканты для малого бизнеса в MAX</p>
          <p className="m0 home-lead">
            Практика, стажировки и подработка в малом бизнесе. Бесплатно для компаний и студентов, подбор по навыкам, контакты —
            после взаимного интереса.
          </p>
        </div>
      </section>
      <div className="actions home-actions">
        <button type="button" className="btn pri" onClick={() => go('/employer')}>
          <svg className="ic sm" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="7" width="18" height="13" rx="2.5" />
            <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18" />
          </svg>
          Я работодатель
        </button>
        <p className="m0 lbl home-role">Опишите задачу — бот приведёт подходящих студентов</p>
        <button type="button" className="btn sec home-student" onClick={() => go('/student')}>
          <svg className="ic sm" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.5 9L12 4.5 21.5 9 12 13.5z" />
            <path d="M6.5 11v4.5c1.5 1.5 3.5 2.2 5.5 2.2s4-.7 5.5-2.2V11" />
          </svg>
          Я студент
        </button>
        <p className="m0 lbl home-role">Места под ваши навыки, отклик одним свайпом</p>
        <p className="m0 lbl home-note">Роль можно сменить в профиле. Тестовые данные помечены жёлтой плашкой.</p>
      </div>
      <CheckGuide />
    </main>
  );
}
