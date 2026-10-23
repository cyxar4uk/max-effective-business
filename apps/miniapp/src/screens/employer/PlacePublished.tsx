import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { api } from '../../api/client';
import { ABOUT } from '../../app/about';
import { haptic, openMaxLink } from '../../max/bridge';
import { paths } from './candidate';
import { CheckIcon, InfoIcon, QrIcon } from './icons';
import { Swap } from './ui';
import './employer.css';

/** Состояние перехода из формы в историю браузера. */
export interface PublishedState {
  /** Место только что опубликовано (а не экран открыт повторно кнопкой «Назад»): анимация и тактильный отклик. */
  justPublished?: boolean;
  /** Сколько собиралась карточка, мс: от первого открытия пустой формы до публикации. */
  buildMs?: number | null;
}

const readState = (state: unknown): PublishedState =>
  typeof state === 'object' && state !== null ? (state as PublishedState) : {};

/** Опрос откликов после публикации: сразу, затем каждые 3 с, не дольше 30 с. */
const POLL_MS = 3000;
const POLL_LIMIT_MS = 30_000;
/** Время сборки дольше часа не показываем: форму открыли давно и вернулись к черновику. */
const BUILD_LIMIT_MS = 60 * 60 * 1000;

/** 134 000 мс → «2 мин 14 с». */
function buildTimeText(ms: number | null | undefined): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0 || ms >= BUILD_LIMIT_MS) return null;
  const total = Math.max(1, Math.round(ms / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min === 0) return `${sec} с`;
  return sec ? `${min} мин ${sec} с` : `${min} мин`;
}

interface Live {
  /** Сколько студентов откликнулось; null — ещё не знаем (первый ответ не пришёл или ошибка). */
  count: number | null;
  /** Опрос идёт. */
  polling: boolean;
}

/** Живой счётчик откликов. Ошибка опроса экран не ломает — просто перестаём спрашивать. */
function useLiveCandidates(id: number): Live {
  const [live, setLive] = useState<Live>({ count: null, polling: true });
  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const startedAt = Date.now();
    const tick = async () => {
      try {
        const { items } = await api.candidates(id);
        if (stopped) return;
        const more = Date.now() - startedAt + POLL_MS <= POLL_LIMIT_MS;
        setLive({ count: items.length, polling: more });
        if (more) timer = window.setTimeout(() => void tick(), POLL_MS);
      } catch {
        if (!stopped) setLive((l) => ({ ...l, polling: false }));
      }
    };
    void tick();
    // Ушли с экрана — опрос останавливаем
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [id]);
  return live;
}

// Та же ссылка, что в «О сервисе»: чат с ботом, где можно нажать «Начать»
const openBot = () => openMaxLink(`https://max.ru/${ABOUT.botNick}?start=`);

/** Что будет после публикации — шаги без сроков: сколько ждать откликов в жизни, мы не знаем. */
const NEXT_STEPS = [
  'Студенты с подходящими навыками получат карточку в MAX.',
  'Бот напишет вам о каждом отклике. Пригласить можно одним нажатием — это ни к чему не обязывает.',
  'После приглашения бот пришлёт контакты обеим сторонам и чек-лист: как оформить и с чего начать.',
];

/** «Место опубликовано»: сколько уже откликнулось, что будет дальше и куда идти. */
export function PlacePublished() {
  const id = Number(useParams().id);
  if (!Number.isInteger(id) || id <= 0) return <Navigate to="/employer" replace />;
  return <Published id={id} />;
}

function Published({ id }: { id: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { buildMs } = readState(location.state);
  // Галочка вспрыгивает и телефон откликается только сразу после публикации
  const [fresh] = useState(() => readState(location.state).justPublished === true);
  const live = useLiveCandidates(id);
  const count = live.count ?? 0;
  const buildTime = buildTimeText(buildMs);

  useEffect(() => {
    if (!fresh) return;
    haptic.notify('success');
    // Снимаем отметку «только что»: при возврате на экран отклик и анимация не повторяются, время сборки остаётся
    navigate(location.pathname, { replace: true, state: { buildMs } satisfies PublishedState });
    // Один раз при появлении экрана
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className={fresh ? 'screen emp pf-fresh' : 'screen emp'}>
      <section className="pf-done">
        <span className="pf-done-ic" aria-hidden="true">
          <CheckIcon className="ic lg" />
        </span>
        <h1 className="h1 pf-rise">Место опубликовано</h1>
        {buildTime && <span className="st ok pf-rise">Карточка собрана за {buildTime}</span>}
        <p className="lead pf-rise">Бот отправит карточку студентам с совпадением от 60 %.</p>

        {(live.count !== null || live.polling) && (
          <div className="surf pf-live pf-rise" role="status" aria-live="polite">
            {count > 0 ? (
              <span key="got" className="pf-live-row pf-fade-in">
                <span className="pf-live-ok" aria-hidden="true">
                  <CheckIcon className="ic xs" />
                </span>
                <span>
                  Уже откликнулись: <b className="num">
                    <Swap text={String(count)} />
                  </b>
                </span>
              </span>
            ) : (
              <span key="wait" className="pf-live-row">
                {live.polling && <span className="pf-pulse" aria-hidden="true" />}
                <span>{live.polling ? 'Ждём первых откликов…' : 'Откликов пока нет'}</span>
              </span>
            )}
          </div>
        )}

        <div className="pf-note pf-rise" role="note">
          <InfoIcon />
          <span className="col">
            <b>В демо отклики приходят сразу</b>
            <span>На новое место откликаются до 5 подходящих тестовых студентов — они помечены как тестовые.</span>
          </span>
        </div>
        <p className="lbl m0 pf-rise">
          Уведомления приходят в чат с ботом. Если вы открыли приложение не из бота, нажмите там «Начать» — иначе бот
          не сможет вам написать.{' '}
          <button type="button" className="pf-link" onClick={openBot}>
            Открыть чат с ботом
          </button>
        </p>
      </section>
      <div className="actions pf-acts pf-rise">
        <button type="button" className="btn pri" onClick={() => navigate(`/employer/internships/${id}/candidates`)}>
          {count > 0 ? `Смотреть кандидатов (${count})` : 'Смотреть кандидатов'}
        </button>
        <button type="button" className="btn sec" onClick={() => navigate('/employer', { replace: true })}>
          Мои места
        </button>
        <button type="button" className="btn ghost" onClick={() => navigate(paths.qr(id))}>
          <QrIcon />
          QR для стенда на ярмарке
        </button>
      </div>
      {/* Под кнопками: на телефоне 390×844 «Смотреть кандидатов» остаётся на первом экране */}
      <section className="surf pf-next pf-rise" aria-labelledby="pf-next-t">
        <h2 className="pf-next-t" id="pf-next-t">
          Что дальше
        </h2>
        <ol className="pf-next-list">
          {NEXT_STEPS.map((text, i) => (
            <li key={i}>
              <span className="pf-next-n num" aria-hidden="true">
                {i + 1}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
