import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../../api/client';
import type { InterestAction, Internship } from '../../api/types';
import { useLoad } from '../../api/useLoad';
import { ErrorState } from '../../components/ErrorState';
import { haptic } from '../../max/bridge';
import { loadSkills, loadTags } from './dict';
import { BackCard, SwipeCard, type Direction } from './PlaceCard';
import { PlaceDetails } from './PlaceDetails';
import { plural, skillNames, TAG_DOT, type SkillNames } from './place';
import { Icon } from './ui';

/** Длительность улёта карточки; в CSS — та же. */
const EXIT_MS = 260;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function FeedLayout({ head, aside, children }: { head: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="feed">
      <div className="feed-main">
        {head}
        {children}
      </div>
      {aside && <aside className="feed-aside">{aside}</aside>}
    </div>
  );
}

function DeckSkeleton() {
  return (
    <div className="feed-deck" role="status" aria-busy="true" aria-label="Загружаем места">
      <div className="stack">
        <div className="pc-skel">
          <div className="skeleton-line" style={{ width: '80%', height: 28 }} />
          <div className="skeleton-line" style={{ width: '55%', height: 14 }} />
          <div className="row" style={{ gap: 12 }}>
            <div className="skeleton-line" style={{ width: 72, height: 34 }} />
            <div className="skeleton-line" style={{ width: 110, height: 28 }} />
          </div>
          <div className="row">
            <div className="skeleton-line" style={{ width: 90, height: 26 }} />
            <div className="skeleton-line" style={{ width: 70, height: 26 }} />
            <div className="skeleton-line" style={{ width: 80, height: 26 }} />
          </div>
        </div>
      </div>
      <div className="acts" style={{ opacity: 0.4 }} aria-hidden="true">
        <span className="fab nope">
          <span className="c" />
          Не интересно
        </span>
        <span className="fab like">
          <span className="c" />
          Интересно
        </span>
      </div>
    </div>
  );
}

interface DeckProps {
  items: Internship[];
  names: SkillNames;
  filtered: boolean;
  onResetFilter: () => void;
  head: (count: number) => ReactNode;
}

type Toast = { text: string; kind: 'ok' | 'error' };

/**
 * Колода: свайп или кнопки, «Вернуть» последнюю пропущенную, клавиши ← → Z на десктопе.
 * Решение уходит на сервер после улёта карточки; ошибка — карточка возвращается наверх с текстом сервера.
 */
function Deck({ items, names, filtered, onResetFilter, head }: DeckProps) {
  const navigate = useNavigate();
  const [queue, setQueue] = useState(items);
  const [skipped, setSkipped] = useState<Internship[]>([]);
  const [exit, setExit] = useState<{ id: number; dir: Direction } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const top = queue[0];
  const next = queue[1];

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.kind === 'error' ? 5000 : 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const send = async (place: Internship, action: InterestAction) => {
    try {
      await api.interest(place.id, action);
      if (action === 'skipped') {
        setSkipped((s) => [...s.filter((p) => p.id !== place.id), place]);
      } else {
        haptic.notify('success');
        setToast({ kind: 'ok', text: 'Отклик отправлен — компания увидит вас в списке кандидатов' });
      }
    } catch (err) {
      haptic.notify('error');
      setQueue((q) => [place, ...q.filter((p) => p.id !== place.id)]);
      setToast({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Не получилось отправить. Повторите.',
      });
    }
  };

  const decide = (dir: Direction) => {
    if (!top || exit) return;
    const place = top;
    setExit({ id: place.id, dir });
    window.setTimeout(
      () => {
        setExit(null);
        setQueue((q) => q.filter((p) => p.id !== place.id));
        void send(place, dir === 1 ? 'interested' : 'skipped');
      },
      reducedMotion() ? 0 : EXIT_MS,
    );
  };

  const undo = () => {
    const last = skipped[skipped.length - 1];
    if (!last || exit) return;
    haptic.impact('light');
    setSkipped((s) => s.slice(0, -1));
    setQueue((q) => [last, ...q.filter((p) => p.id !== last.id)]);
  };

  // Клавиши на десктопе: ← не интересно, → интересно, Z вернуть. Обработчик на window, снимается при уходе с экрана
  const keys = useRef({ decide, undo });
  useEffect(() => {
    keys.current = { decide, undo };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        keys.current.decide(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        keys.current.decide(1);
      } else if (e.code === 'KeyZ') {
        keys.current.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const aside = top ? (
    <>
      <span className="cap">О месте</span>
      <PlaceDetails place={top} names={names} withHead />
    </>
  ) : null;

  return (
    <FeedLayout head={head(queue.length)} aside={aside}>
      {top ? (
        <div className="feed-deck">
          <div className="stack">
            {next && <BackCard key={`back-${next.id}`} place={next} />}
            <SwipeCard
              key={top.id}
              place={top}
              names={names}
              exit={exit?.id === top.id ? exit.dir : null}
              onSwipe={decide}
            />
          </div>
          <div className="acts">
            <button type="button" className="fab sm" onClick={undo} disabled={skipped.length === 0}>
              <span className="c">
                <Icon name="undo" size="sm" />
              </span>
              <span className="fab-l">
                Вернуть <span className="kbd">Z</span>
              </span>
            </button>
            <button type="button" className="fab nope" onClick={() => decide(-1)}>
              <span className="c">
                <Icon name="cross" size="lg" />
              </span>
              <span className="fab-l">
                Не интересно <span className="kbd">←</span>
              </span>
            </button>
            <button type="button" className="fab like" onClick={() => decide(1)}>
              <span className="c">
                <Icon name="check" size="lg" />
              </span>
              <span className="fab-l">
                Интересно <span className="kbd">→</span>
              </span>
            </button>
            <button type="button" className="fab sm" onClick={() => navigate(`/internships/${top.id}`)}>
              <span className="c">
                <Icon name="up" size="sm" />
              </span>
              Подробнее
            </button>
          </div>
        </div>
      ) : (
        <div className="state feed-empty">
          <div className="orb feed-orb" aria-hidden="true">
            <i className="a" />
            <i className="b" />
          </div>
          <h2 className="state-title d">
            {items.length > 0 ? 'Вы посмотрели все места' : filtered ? 'По этим тегам мест нет' : 'Пока нет подходящих мест'}
          </h2>
          <p className="state-text">
            Новые пришлём в бот, как только компания опубликует место под ваши навыки. Больше навыков — больше совпадений.
          </p>
          <button type="button" className="btn pri" onClick={() => navigate('/student/profile/edit?step=skills')}>
            Добавить навыки
          </button>
          {filtered && (
            <button type="button" className="btn ghost" onClick={onResetFilter}>
              Сбросить фильтр
            </button>
          )}
          {skipped.length > 0 && (
            <button type="button" className="btn ghost" onClick={undo}>
              Вернуть пропущенное
            </button>
          )}
        </div>
      )}
      {toast && (
        <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.text}
        </div>
      )}
    </FeedLayout>
  );
}

/** Лента студента «Для вас»: фильтр тегами и колода мест. */
export function StudentFeed() {
  const [tags, setTags] = useState<string[]>([]);
  const [tagsState] = useLoad(loadTags, []);
  const [state, retry] = useLoad(async () => {
    const [feed, skills] = await Promise.all([api.feed(tags), loadSkills()]);
    return { items: feed.items, names: skillNames(skills) };
  }, [tags.join(',')]);

  const toggle = (code: string) => {
    haptic.selection();
    setTags((t) => (t.includes(code) ? t.filter((c) => c !== code) : [...t, code]));
  };

  /** count: число мест в колоде; 'loading' и 'error' — пока колоды нет. */
  const head = (count: number | 'loading' | 'error') => (
    <>
      <div className="top feed-top">
        <div className="col" style={{ gap: 2 }}>
          <h1 className="d m0 feed-h1">Для вас</h1>
          {count !== 'error' && (
            <span className="lbl">
              {count === 'loading'
                ? 'Подбираем места…'
                : count > 0
                  ? `${count} ${plural(count, ['место', 'места', 'мест'])} · сначала самые подходящие`
                  : 'Новые места придут в бот'}
            </span>
          )}
        </div>
      </div>
      {tagsState.status === 'ok' && tagsState.data.items.length > 0 && (
        <div className="chips feed-chips" role="group" aria-label="Фильтр по задачам">
          <button type="button" className={tags.length === 0 ? 'chip on' : 'chip'} onClick={() => setTags([])} aria-pressed={tags.length === 0}>
            Все
          </button>
          {tagsState.data.items.map((t) => {
            const on = tags.includes(t.code);
            return (
              <button key={t.code} type="button" className={on ? 'chip on' : 'chip'} onClick={() => toggle(t.code)} aria-pressed={on}>
                <i className="dot" style={{ background: TAG_DOT[t.code] ?? 'var(--lo)' }} />
                {t.name}
              </button>
            );
          })}
        </div>
      )}
    </>
  );

  if (state.status === 'loading') {
    return (
      <FeedLayout head={head('loading')}>
        <DeckSkeleton />
      </FeedLayout>
    );
  }
  if (state.status === 'error') {
    return (
      <FeedLayout head={head('error')}>
        <ErrorState error={state.error} onRetry={retry} />
      </FeedLayout>
    );
  }
  return (
    <Deck
      items={state.data.items}
      names={state.data.names}
      filtered={tags.length > 0}
      onResetFilter={() => setTags([])}
      head={head}
    />
  );
}
