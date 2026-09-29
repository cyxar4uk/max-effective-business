// «Как проверить за 5 минут» на главном: весь сценарий одним аккаунтом — компания, студент, «Это тандем!».
// Шаги отмечаются сами по данным API; свёрнута карточка или нет — помним на этом устройстве.
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api } from '../api/client';
import type { Interest, Internship, Me } from '../api/types';
import { useLoad } from '../api/useLoad';
import { haptic } from '../max/bridge';
import { CheckIcon, ChevronIcon, RouteIcon } from './employer/icons';
import './CheckGuide.css';

const OPEN_KEY = 'tandem.checkGuide.open';

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    // Хранилище недоступно — карточка просто откроется развёрнутой в следующий раз
  }
}

interface Progress {
  me: Me;
  /** Свои места, открытые — первыми. */
  places: Internship[];
  /** Свой отклик на своё место (любой статус, кроме «Пропустить»). */
  mine: Interest | null;
  /** Свой отклик на своё место в статусе «приглашён». */
  invited: Interest | null;
}

async function loadProgress(): Promise<Progress> {
  const me = await api.me();
  const [places, interests] = await Promise.all([
    me.roles.employer ? api.employerInternships().then((r) => r.items) : Promise.resolve([]),
    me.roles.student ? api.interests().then((r) => r.items) : Promise.resolve([]),
  ]);
  const ownIds = new Set(places.map((p) => p.id));
  const own = interests.filter((i) => ownIds.has(i.internship.id));
  const invited = own.find((i) => i.status === 'invited') ?? null;
  return {
    me,
    places: [...places].sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open')),
    mine: invited ?? own.find((i) => i.status === 'interested') ?? own[0] ?? null,
    invited,
  };
}

interface Step {
  title: string;
  hint: string;
  done: boolean;
  action: string;
  go: () => void;
}

/** Состояние перехода на главный: открыть карточку и прокрутить к ней (ссылка из «Моих мест»). */
export interface GuideState {
  guide?: boolean;
}

export function CheckGuide() {
  const navigate = useNavigate();
  const location = useLocation();
  const asked = (location.state as GuideState | null)?.guide === true;
  const [state, retry] = useLoad(loadProgress, []);
  const [open, setOpen] = useState(() => asked || readOpen());
  const box = useRef<HTMLElement>(null);
  const bodyId = useId();

  // Пришли по ссылке «Как проверить» — показываем карточку
  useEffect(() => {
    if (!asked) return;
    box.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    box.current?.querySelector<HTMLButtonElement>('.cg-head')?.focus({ preventScroll: true });
  }, [asked]);

  const toggle = () => {
    haptic.selection();
    setOpen(!open);
    writeOpen(!open);
  };

  const go = (path: string, navState?: unknown) => () => {
    haptic.selection();
    navigate(path, navState ? { state: navState } : undefined);
  };

  let steps: Step[] = [];
  if (state.status === 'ok') {
    const { me, places, mine, invited } = state.data;
    const place = places[0];
    const mineId = mine?.internship.id ?? place?.id;
    steps = [
      {
        title: 'Создайте профиль компании',
        hint: 'Название, город и контактное лицо — меньше минуты.',
        done: me.roles.employer,
        action: 'Заполнить профиль',
        go: go('/employer/profile'),
      },
      {
        title: 'Опубликуйте место',
        hint: 'Задача, навыки и сроки — около 3 минут. Бот разошлёт карточку подходящим студентам.',
        done: places.length > 0,
        action: 'Создать место',
        go: go('/employer/new'),
      },
      {
        title: 'Заполните анкету студента',
        hint: 'Тем же аккаунтом: вуз, курс, формат и навыки.',
        done: me.roles.student,
        action: 'Заполнить анкету',
        go: go('/student'),
      },
      {
        title: 'Нажмите «Интересно» на своём месте',
        hint: 'Своё место стоит в ленте студента первым.',
        done: mine !== null,
        action: 'Открыть своё место',
        go: place ? go(`/internships/${place.id}`, { asStudent: true }) : go('/student'),
      },
      {
        title: 'Пригласите себя',
        hint: 'Кандидаты места → «Пригласить» → «Это тандем!», а бот пришлёт контакты обеим сторонам.',
        done: invited !== null,
        action: 'Открыть кандидатов',
        go: go(mineId ? `/employer/internships/${mineId}/candidates` : '/employer'),
      },
    ];
  }
  const doneCount = steps.filter((s) => s.done).length;
  const all = steps.length > 0 && doneCount === steps.length;
  const current = steps.findIndex((s) => !s.done);

  return (
    <section className="surf cg" ref={box} aria-label="Как проверить за 5 минут">
      <button type="button" className="cg-head" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
        <span className={all ? 'cg-ic done' : 'cg-ic'} aria-hidden="true">
          {all ? <CheckIcon /> : <RouteIcon />}
        </span>
        <span className="col grow">
          <span className="cg-t">{all ? 'Сценарий пройден' : 'Как проверить за 5 минут'}</span>
          <span className="lbl">
            {state.status === 'ok'
              ? all
                ? 'Компания, студент и «Это тандем!» — одним аккаунтом'
                : `Весь сценарий одним аккаунтом · готово ${doneCount} из ${steps.length}`
              : 'Весь сценарий одним аккаунтом: компания и студент'}
          </span>
        </span>
        <ChevronIcon dir={open ? 'up' : 'down'} />
      </button>

      {open && (
        <div id={bodyId} className="cg-body">
          {state.status === 'loading' ? (
            <p className="lbl cg-msg" role="status">
              Проверяем, что уже сделано…
            </p>
          ) : state.status === 'error' ? (
            <div className="cg-msg" role="alert">
              <p className="lbl m0">Не получилось проверить шаги: {state.error.message}</p>
              <button type="button" className="btn sec sm" onClick={retry}>
                Повторить
              </button>
            </div>
          ) : (
            <ol className="cg-steps">
              {steps.map((s, i) => (
                <li key={s.title} className={s.done ? 'cg-step done' : i === current ? 'cg-step now' : 'cg-step'}>
                  <span className="cg-n" aria-hidden="true">
                    {s.done ? <CheckIcon className="ic xs" /> : i + 1}
                  </span>
                  <span className="col grow">
                    <span className="cg-step-t">
                      {s.title}
                      <span className="sr-only">{s.done ? ' — готово' : i === current ? ' — следующий шаг' : ''}</span>
                    </span>
                    {!s.done && <span className="lbl">{s.hint}</span>}
                    {i === current && (
                      <button type="button" className="btn pri sm cg-go" onClick={s.go}>
                        {s.action}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
