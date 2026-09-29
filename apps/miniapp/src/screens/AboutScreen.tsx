import type { MouseEvent } from 'react';
import { ABOUT, type AboutLink } from '../app/about';
import { DemoBadge } from '../components/DemoBadge';
import { openLink, openMaxLink } from '../max/bridge';
import './AboutScreen.css';

/** Документ открываем через MAX (во внешнем браузере), путь из public — относительно домена мини-приложения. */
function open(e: MouseEvent, link: AboutLink) {
  e.preventDefault();
  openLink(new URL(link.url, window.location.origin).href);
}

/**
 * «О сервисе»: назначение, тестовые данные, работа с персональными данными, документы, реквизиты и поддержка
 * (требование модерации MAX). Документы, реквизиты и поддержка — из src/app/about.ts.
 */
export function AboutScreen() {
  const { documents, requisites, support, botNick } = ABOUT;

  return (
    <main className="screen">
      <header className="page-head">
        <h1 className="h1">О сервисе</h1>
      </header>
      <div className="stack-v">
        <section className="surf about">
          <h2 className="h2">«Тандем»</h2>
          <p>
            Бот и мини-приложение для центров карьеры: практика и стажировки. Студент один раз заполняет анкету и видит
            только подходящие места с процентом совпадения. Работодатель получает откликнувшихся студентов по убыванию
            совпадения. После приглашения бот присылает студенту контакт работодателя и чек-лист следующих шагов,
            работодателю — имя и телефон студента.
          </p>
        </section>

        <section className="surf about">
          <h2 className="h2">Тестовые данные</h2>
          <p>
            Часть мест, компаний и студентов — тестовые, чтобы сценарий можно было пройти сразу. Они помечены{' '}
            <DemoBadge isDemo />. Тестовым пользователям бот не пишет.
          </p>
        </section>

        <section className="surf about">
          <h2 className="h2">Персональные данные</h2>
          <ul>
            <li>До согласия на обработку данных храним только ваш id в MAX и имя.</li>
            <li>Телефон — только тот, которым вы поделились через MAX.</li>
            <li>Фамилию и телефон студента работодатель видит только после того, как пригласит его.</li>
            <li>Работодатель видит анкеты только тех, кто откликнулся на его место.</li>
            <li>Каждый запрос подписан MAX и проверяется на сервере.</li>
          </ul>
        </section>

        {documents.length > 0 && (
          <section className="surf about-links" aria-label="Документы">
            {documents.map((doc) => (
              <a key={doc.url} className="li" href={doc.url} onClick={(e) => open(e, doc)}>
                <span className="grow">{doc.title}</span>
              </a>
            ))}
          </section>
        )}

        {(requisites.length > 0 || support) && (
          <section className="surf about">
            {requisites.length > 0 && (
              <>
                <h2 className="h2">Реквизиты</h2>
                {requisites.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </>
            )}
            {support && (
              <p>
                Поддержка:{' '}
                <a href={support.url} onClick={(e) => open(e, support)}>
                  {support.title}
                </a>
              </p>
            )}
          </section>
        )}

        <section className="surf about">
          <h2 className="h2">Уведомления</h2>
          <p>
            О новых местах, откликах и приглашениях пишет бот; с 22:00 до 9:00 сообщения приходят утром. Если вы
            открыли мини-приложение по ссылке, нажмите «Начать» в чате с ботом — иначе он может не суметь вам написать.
          </p>
          <button type="button" className="btn sec" onClick={() => openMaxLink(`https://max.ru/${botNick}?start=`)}>
            Открыть чат с ботом
          </button>
        </section>
      </div>
    </main>
  );
}
