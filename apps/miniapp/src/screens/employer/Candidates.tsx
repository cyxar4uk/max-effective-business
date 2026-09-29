// Кандидаты на место (макеты c3 CandidatesList, c2 Candidates, c3 DeskCompare): вкладки по статусу, «Список» и
// «Карточки» на телефоне, список и карточка рядом на десктопе. Решения — только кнопками и с 5 секундами на отмену.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { api, ApiError } from '../../api/client';
import type { Candidate, Internship } from '../../api/types';
import { useData } from '../../api/useData';
import { matchText, useSkillNames, type SkillNames } from '../../app/matchText';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { haptic } from '../../max/bridge';
import {
  firstName,
  isTab,
  loadPlaceData,
  paths,
  placeLine,
  responsesText,
  studyLine,
  TAB_LABEL,
  TAB_STATUS,
  withCandidate,
  type PlaceData,
  type Tab,
} from './candidate';
import { SwipeDeck, type SwipeDeckHandle } from '../../components/SwipeDeck';
import { CandidateActions, CandidateCard, CandidateCardBody } from './CandidateCard';
import { Avatar, Eq, Notice, UndoToast, type NoticeValue } from './candidateUi';
import { CloseSheet } from './CloseSheet';
import { plural } from './draft';
import { CardIcon, ChevronIcon, ListIcon } from './icons';
import { PlaceArt } from './PlaceArt';
import { useDecision, type Decision, type Pending } from './useDecision';
import { useDesktop } from './useDesktop';
import './employer.css';
import './places.css';
import { DemoBadge } from '../../components/DemoBadge';

type View = 'list' | 'cards';

/** Карточки открыты тапом по строке списка (переход в истории). */
interface CardsState {
  fromList?: boolean;
}

const TABS: Tab[] = ['waiting', 'invited', 'declined'];

/** Состояние перехода на «Это тандем!». */
export interface TandemState {
  justInvited?: boolean;
  candidate?: Candidate;
  place?: Internship;
}

export function Candidates() {
  const id = Number(useParams().id);
  if (!Number.isInteger(id) || id <= 0) return <Navigate to="/employer" replace />;
  return <CandidatesScreen key={id} id={id} />;
}

function CandidatesScreen({ id }: { id: number }) {
  const data = useData(() => loadPlaceData(id), [id]);
  const names = useSkillNames();

  return (
    <main className="screen emp cd">
      {data.state.status === 'loading' ? (
        <div className="cd-loading">
          <Skeleton lines={1} height={64} />
          <Skeleton lines={4} height={84} />
        </div>
      ) : data.state.status === 'error' ? (
        data.state.error.code === 'NOT_FOUND' ? (
          <section className="state">
            <h1 className="state-title d">Место не найдено</h1>
            <p className="state-text">Возможно, его открыли по старой ссылке. Ваши места — в «Моих местах».</p>
            <Link className="btn pri" to="/employer" replace>
              К моим местам
            </Link>
          </section>
        ) : (
          <ErrorState error={data.state.error} onRetry={data.retry} />
        )
      ) : (
        <Loaded data={data.state.data} names={names} update={data.update} refresh={data.refresh} />
      )}
    </main>
  );
}

interface LoadedProps {
  data: PlaceData;
  names: SkillNames;
  update: (change: (d: PlaceData) => PlaceData) => void;
  refresh: () => void;
}

function Loaded({ data, names, update, refresh }: LoadedProps) {
  const { place, items } = data;
  const navigate = useNavigate();
  const location = useLocation();
  const desktop = useDesktop();
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const [sheet, setSheet] = useState(false);
  const [reopening, setReopening] = useState(false);
  const rows = useRef(new Map<number, HTMLButtonElement>());

  const tabParam = params.get('tab');
  const tab: Tab = isTab(tabParam) ? tabParam : 'waiting';
  const view: View = params.get('view') === 'cards' ? 'cards' : 'list';
  const list = items.filter((c) => c.status === TAB_STATUS[tab]);
  const selId = Number(params.get('c'));
  const selected = list.find((c) => c.studentId === selId) ?? list[0] ?? null;
  const index = selected ? list.indexOf(selected) : -1;
  // Колода «Карточки» пролистана до конца
  const atEnd = !desktop && view === 'cards' && params.get('c') === 'end' && list.length > 0;
  const counts = Object.fromEntries(TABS.map((t) => [t, items.filter((c) => c.status === TAB_STATUS[t]).length])) as Record<
    Tab,
    number
  >;

  const say = useCallback((text: string, tone: NoticeValue['tone']) => setNotice((n) => ({ text, tone, n: (n?.n ?? 0) + 1 })), []);
  const hideNotice = useCallback(() => setNotice(null), []);

  const decision = useDecision({
    onDone: (c, action, mounted) => {
      if (!mounted) return;
      update((d) => withCandidate(d, c));
      if (action === 'invite') {
        // Тактильный отклик — сразу с ответом сервера, вместе с переходом на «Это тандем!»
        haptic.notify('success');
        navigate(paths.tandem(place.id, c.studentId), {
          state: { justInvited: true, candidate: c, place } satisfies TandemState,
        });
      } else {
        say(`Отказ отправлен: ${firstName(c)}`, 'ok');
      }
    },
    onError: (err) => {
      haptic.notify('error');
      say(err.message, 'error');
      refresh();
    },
  });
  const { pending, sending } = decision;
  // Решение в отсчёте или в пути — кнопки этого кандидата недоступны
  const busy = pending ?? sending;

  const setQuery = (next: { tab?: Tab; view?: View; c?: number | 'end' | null }, push = false) => {
    const q = new URLSearchParams(params);
    if (next.tab !== undefined) {
      if (next.tab === 'waiting') q.delete('tab');
      else q.set('tab', next.tab);
    }
    if (next.view !== undefined) {
      if (next.view === 'list') q.delete('view');
      else q.set('view', next.view);
    }
    if (next.c !== undefined) {
      if (next.c === null) q.delete('c');
      else q.set('c', String(next.c));
    }
    setParams(q, push ? { state: { fromList: true } satisfies CardsState } : { replace: true, state: location.state });
  };

  const decide = (c: Candidate, action: Decision) => {
    haptic.impact(action === 'invite' ? 'medium' : 'light');
    decision.decide(place.id, c, action);
  };

  const cancel = () => {
    haptic.selection();
    decision.cancel();
  };

  const openSheet = () => {
    // Решение в отсчёте уходит сразу: иначе шторка откажет тому, кого вы только что пригласили
    decision.flush();
    setSheet(true);
  };

  const select = (c: Candidate, focus = false) => {
    setQuery({ c: c.studentId });
    if (focus) {
      const el = rows.current.get(c.studentId);
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
    }
  };

  const openCard = (c: Candidate) => {
    haptic.selection();
    if (desktop) select(c);
    else setQuery({ view: 'cards', c: c.studentId }, true);
  };

  // Карточку открыли из списка — «Список» возвращает назад по истории, без лишнего шага для кнопки «Назад»
  const toList = () => {
    if (view === 'list') return;
    if ((location.state as CardsState | null)?.fromList) navigate(-1);
    else setQuery({ view: 'list' });
  };

  const step = (delta: number) => {
    if (list.length === 0) return;
    const next = list[Math.min(list.length - 1, Math.max(0, index + delta))];
    if (next && next !== selected) {
      haptic.selection();
      select(next, desktop);
    }
  };

  const reopen = async () => {
    setReopening(true);
    try {
      const updated = await api.updateInternship(place.id, { status: 'open' });
      update((d) => ({ ...d, place: { ...d.place, ...updated } }));
      haptic.notify('success');
      say('Набор снова открыт', 'ok');
    } catch (err) {
      haptic.notify('error');
      say(err instanceof ApiError ? err.message : 'Не получилось открыть набор. Повторите попытку.', 'error');
    } finally {
      setReopening(false);
    }
  };

  // Десктоп: ↑↓ — кандидат, Enter — пригласить, Backspace — отказать, Esc — отменить решение в отсчёте
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      if (!desktop || sheet || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      const onRow = Boolean(target?.closest('[data-cd-row]'));
      const free = onRow || target === document.body || target?.tagName === 'MAIN';
      if (e.key === 'Escape' && pending) {
        e.preventDefault();
        cancel();
        return;
      }
      if (!free) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        step(e.key === 'ArrowDown' ? 1 : -1);
      } else if ((e.key === 'Enter' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        const canDecide =
          selected.status === 'interested' && place.status === 'open' && busy?.candidate.studentId !== selected.studentId;
        if (canDecide) decide(selected, e.key === 'Enter' ? 'invite' : 'decline');
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const total = items.length;
  const pendingFor = (c: Candidate): Decision | null =>
    busy && busy.candidate.studentId === c.studentId ? busy.action : null;

  const head = (
    <header className="cd-head">
      <span className="thumb cd-thumb">
        <PlaceArt place={place} variant="thumb" />
      </span>
      <div className="col grow">
        <span className="lbl cd-kicker">
          {placeLine(place)}
          {total > 0 ? ` · ${responsesText(total)}` : ''}
        </span>
        <h1 className="cd-title">{place.title}</h1>
      </div>
      {desktop && place.status === 'open' && (
        <button type="button" className="btn sec sm" onClick={openSheet}>
          Закрыть набор
        </button>
      )}
    </header>
  );

  const toggle = (
    <div className="seg cd-views" role="group" aria-label="Вид">
      <button type="button" className={view === 'list' ? 'on' : undefined} aria-pressed={view === 'list'} aria-label="Список" onClick={toList}>
        <ListIcon />
      </button>
      <button type="button" className={view === 'cards' ? 'on' : undefined} aria-pressed={view === 'cards'} aria-label="Карточки" onClick={() => setQuery({ view: 'cards' })}>
        <CardIcon />
      </button>
    </div>
  );

  const closedBanner = place.status === 'closed' && (
    <div className="surf cd-closed cd-fade" role="status">
      <span className="col grow">
        <span className="cd-closed-t">Набор закрыт</span>
        <span className="lbl">Места нет в ленте, новые отклики не придут.</span>
      </span>
      <button type="button" className="btn sec sm" disabled={reopening} onClick={() => void reopen()}>
        {reopening ? 'Открываем…' : 'Открыть снова'}
      </button>
    </div>
  );

  const tabs = (
    <div className="seg cd-tabs" role="tablist" aria-label="Кандидаты по статусу">
      {TABS.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          id={`cd-tab-${t}`}
          aria-selected={tab === t}
          aria-controls="cd-panel"
          className={tab === t ? 'on' : undefined}
          onClick={() => {
            haptic.selection();
            setQuery({ tab: t, c: null });
          }}
        >
          {TAB_LABEL[t]} · <span className="num">{counts[t]}</span>
        </button>
      ))}
    </div>
  );

  const toasts = (
    <div className="cd-toasts" aria-live="polite">
      {notice && <Notice key={notice.n} notice={notice} onClose={hideNotice} />}
      {pending && (
        <UndoToast key={pending.n} action={pending.action} name={firstName(pending.candidate)} onCancel={cancel} />
      )}
    </div>
  );

  const sheetEl = sheet && (
    <CloseSheet
      data={data}
      skip={busy?.candidate.studentId ?? null}
      onClose={() => setSheet(false)}
      onDone={(next, declined, failed) => {
        update(() => next);
        setSheet(false);
        if (failed) say(`Набор закрыт, но не все отказы отправились: ${failed}`, 'error');
        else if (declined > 0) say(`Набор закрыт, отказ отправлен ${declined} ${plural(declined, ['кандидату', 'кандидатам', 'кандидатам'])}`, 'ok');
        else say('Набор закрыт', 'ok');
      }}
    />
  );

  if (total === 0) {
    return (
      <>
        {head}
        {closedBanner}
        <section className="cd-empty cd-in">
          <h2 className="h2">{place.status === 'closed' ? 'Откликов не было' : 'Откликов пока нет'}</h2>
          {place.status === 'open' && (
            <>
              <p className="lead">
                Бот разослал карточку студентам, которым место подходит от 60 %. Отклики появятся здесь, а бот напишет
                вам в чат.
              </p>
              <p className="lbl">
                Очное место в городе, где нет тестовых студентов, может остаться без откликов — для проверки попробуйте
                удалённый или гибридный формат.
              </p>
            </>
          )}
          <div className="actions">
            <button type="button" className="btn pri" onClick={() => refresh()}>
              Обновить
            </button>
            <Link className="btn ghost" to="/employer">
              К моим местам
            </Link>
          </div>
        </section>
        {place.status === 'open' && !desktop && (
          <button type="button" className="btn ghost sm cd-close-link" onClick={openSheet}>
            Закрыть набор
          </button>
        )}
        {toasts}
        {sheetEl}
      </>
    );
  }

  const listEl = (
    <CandidateList
      list={list}
      tab={tab}
      closed={place.status === 'closed'}
      selected={desktop ? selected : null}
      names={names}
      pendingFor={pendingFor}
      sendingId={sending?.candidate.studentId ?? null}
      onOpen={openCard}
      rowRef={(sid, el) => {
        if (el) rows.current.set(sid, el);
        else rows.current.delete(sid);
      }}
    />
  );

  if (desktop) {
    return (
      <>
        {head}
        <div className="cd-desk">
          <section className="cd-desk-list">
            {closedBanner}
            {tabs}
            <div id="cd-panel" role="tabpanel" aria-labelledby={`cd-tab-${tab}`} key={tab} className="cd-fade">
              {listEl}
            </div>
          </section>
          <section className="cd-pane" aria-label="Выбранный кандидат">
            {selected ? (
              <div key={selected.studentId} className="cd-pane-in cd-fade">
                <CandidateCard c={selected} names={names} pending={pendingFor(selected)} />
                <CandidateActions c={selected} place={place} pending={busy} onDecide={(a) => decide(selected, a)} />
              </div>
            ) : (
              <p className="lbl cd-pane-empty">Выберите кандидата слева.</p>
            )}
          </section>
        </div>
        <p className="cd-keys lbl" aria-hidden="true">
          <span className="kbd">↑</span>
          <span className="kbd">↓</span> кандидат <span className="kbd">Enter</span> пригласить{' '}
          <span className="kbd">Backspace</span> отказать <span className="kbd">Esc</span> отменить решение
        </p>
        {toasts}
        {sheetEl}
      </>
    );
  }

  return (
    <>
      {head}
      {closedBanner}
      {tabs}
      <div id="cd-panel" role="tabpanel" aria-labelledby={`cd-tab-${tab}`} key={`${tab}-${view}`} className="cd-panel cd-fade">
        {view === 'list' || (!selected && !atEnd) ? (
          <>
            {list.length > 0 && (
              <div className="cd-bar">
                <span className="lbl">
                  {list.length} {plural(list.length, ['кандидат', 'кандидата', 'кандидатов'])} · сначала самые подходящие
                </span>
                {toggle}
              </div>
            )}
            {listEl}
          </>
        ) : (
          <CardDeck
            list={list}
            index={atEnd ? list.length : index}
            names={names}
            place={place}
            pending={busy}
            onGo={(i) => setQuery({ c: i >= list.length ? 'end' : list[i].studentId })}
            onDecide={decide}
            toggle={toggle}
          />
        )}
      </div>
      {place.status === 'open' && view === 'list' && (
        <button type="button" className="btn ghost sm cd-close-link" onClick={openSheet}>
          Закрыть набор
        </button>
      )}
      {toasts}
      {sheetEl}
    </>
  );
}

const EMPTY_TAB: Record<Tab, string> = {
  waiting: 'Все отклики разобраны. Новые появятся здесь, бот напишет о них в чат.',
  invited: 'Пока никого не пригласили.',
  declined: 'Отказов нет.',
};

interface ListProps {
  list: Candidate[];
  tab: Tab;
  /** Набор закрыт: новых откликов не будет. */
  closed: boolean;
  selected: Candidate | null;
  names: SkillNames;
  pendingFor: (c: Candidate) => Decision | null;
  /** Кандидат, решение по которому уже ушло на сервер. */
  sendingId: number | null;
  onOpen: (c: Candidate) => void;
  rowRef: (studentId: number, el: HTMLButtonElement | null) => void;
}

/** Список кандидатов: проявляется снизу со сдвигом 20 мс на строку. */
function CandidateList({ list, tab, closed, selected, names, pendingFor, sendingId, onOpen, rowRef }: ListProps) {
  if (list.length === 0) {
    return <p className="lbl cd-tab-empty">{tab === 'waiting' && closed ? 'Никто не ждёт решения.' : EMPTY_TAB[tab]}</p>;
  }
  return (
    <ul className="surf cd-list">
      {list.map((c, i) => {
        const on = selected?.studentId === c.studentId;
        const p = pendingFor(c);
        const name = c.status === 'invited' ? [firstName(c), c.lastName].filter(Boolean).join(' ') : firstName(c);
        return (
          <li key={c.studentId} className="cd-li cd-in" style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}>
            <button
              type="button"
              className={on ? 'cd-row on' : 'cd-row'}
              aria-current={on ? 'true' : undefined}
              data-cd-row=""
              ref={(el) => rowRef(c.studentId, el)}
              onClick={() => onOpen(c)}
            >
              <Avatar c={c} size={44} />
              <span className="col grow">
                <span className="cd-row-name">
                  <span className="cd-row-n">{name}</span>
                  <DemoBadge isDemo={c.isDemo} kind="response" />
                </span>
                {studyLine(c) && <span className="lbl">{studyLine(c)}</span>}
                {p ? (
                  <span className="st wait cd-row-st">
                    {sendingId === c.studentId
                      ? 'Отправляем…'
                      : p === 'invite'
                        ? 'Приглашение ждёт отправки'
                        : 'Отказ ждёт отправки'}
                  </span>
                ) : (
                  <span className="cd-row-phrase">{matchText(c.match, names)}</span>
                )}
              </span>
              <span className="cd-row-pct">
                <span className="pct pct-sm num">
                  {c.match.score}
                  <small>%</small>
                </span>
                <Eq score={c.match.score} height={16} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface DeckProps {
  list: Candidate[];
  /** Верхняя карточка; list.length — все просмотрены. */
  index: number;
  names: SkillNames;
  place: Internship;
  pending: Pending | null;
  onGo: (index: number) => void;
  onDecide: (c: Candidate, action: Decision) => void;
  /** Переключатель «Список / Карточки» — справа от счётчика. */
  toggle: ReactNode;
}

/**
 * «Карточки»: общая колода SwipeDeck (как лента студента), но только для листания — свайп в любую сторону
 * открывает следующего кандидата, «‹» возвращает предыдущего с той стороны, куда он ушёл.
 * Решения отправляются только кнопками под карточкой.
 */
function CardDeck({ list, index, names, place, pending, onGo, onDecide, toggle }: DeckProps) {
  const deck = useRef<SwipeDeckHandle>(null);
  const c = list[index] ?? null;

  const next = () => {
    deck.current?.swipe(-1);
  };
  const prev = () => {
    if (index === 0) return;
    haptic.selection();
    onGo(index - 1);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    }
  };

  return (
    <div className="cd-deck">
      <div className="cd-bar">
        <div className="cd-pager">
          <button type="button" className="ibtn" aria-label="Предыдущий кандидат" disabled={index === 0} onClick={prev}>
            <ChevronIcon dir="left" />
          </button>
          <span className="lbl num" aria-live="polite">
            {c ? `${index + 1} из ${list.length}` : `Все ${list.length}`}
          </span>
          <button type="button" className="ibtn" aria-label="Следующий кандидат" disabled={!c} onClick={next}>
            <ChevronIcon dir="right" />
          </button>
        </div>
        {toggle}
      </div>
      <div
        className="cd-deck-area"
        role="group"
        tabIndex={0}
        onKeyDown={onKey}
        aria-roledescription="колода кандидатов"
        aria-label="Листайте свайпом или стрелками ← →. Пригласить и отказать — кнопками под карточкой"
      >
        <SwipeDeck
          ref={deck}
          className="cd-swipe"
          items={list.slice(index)}
          getKey={(x) => x.studentId}
          cardLabel={(x) => `Кандидат: ${firstName(x)}, совпадение ${x.match.score} %`}
          renderCard={(x) => (
            <CandidateCardBody
              c={x}
              names={names}
              pending={pending?.candidate.studentId === x.studentId ? pending.action : null}
            />
          )}
          onSwipe={(x) => onGo(list.indexOf(x) + 1)}
          empty={
            <div className="deck-empty cd-deck-end">
              <h2 className="h2">Вы посмотрели всех</h2>
              <p className="lbl m0">Вернитесь к первому или откройте список.</p>
              <button type="button" className="btn sec sm" onClick={() => onGo(0)}>
                К первому
              </button>
            </div>
          }
        />
      </div>
      {c && <CandidateActions c={c} place={place} pending={pending} onDecide={(a) => onDecide(c, a)} />}
    </div>
  );
}
