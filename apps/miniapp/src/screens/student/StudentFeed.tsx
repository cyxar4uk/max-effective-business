import { AnimatePresence, motion, useMotionValue } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../../api/client';
import type { Internship } from '../../api/types';
import { useLoad } from '../../api/useLoad';
import { ABOUT } from '../../app/about';
import { useMe } from '../../app/me';
import { ErrorState } from '../../components/ErrorState';
import { DeckButton, SwipeDeck, type SwipeDeckHandle, type SwipeDir } from '../../components/SwipeDeck';
import { haptic, openMaxLink } from '../../max/bridge';
import { fade, spring, useReduced } from '../../motion/springs';
import { listItem } from '../../motion/variants';
import { loadSkills, loadTags } from './dict';
import { loadOwnPlaces, withOwnFirst } from './ownPlaces';
import { PlaceCardFace } from './PlaceCard';
import { PlaceDetails } from './PlaceDetails';
import { plural, skillNames, tagColor, type SkillNames } from './place';
import { ScanNotice } from './ScanNotice';
import { useInviteWatch } from './inviteWatch';
import { createSkipQueue } from './skipQueue';
import { tandemPath, type TandemState } from './tandem';
import { Icon } from './ui';
import { useScanPlace } from './useScanPlace';

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

/** Плашка с кнопкой: подсказка про бота или «Компания пригласила вас · Открыть». */
type Hint = { text: string; label: string; onClick: () => void; ms: number };

const STAMPS = { like: 'Интересно', nope: 'Не интересно' };

/** Подсказка про бота — после первого успешного «Интересно», не чаще раза за сессию. */
const BOT_HINT_KEY = 'tandem.botHintShown';
let botHintShown = false;
function takeBotHint(): boolean {
  if (botHintShown) return false;
  botHintShown = true;
  try {
    if (sessionStorage.getItem(BOT_HINT_KEY)) return false;
    sessionStorage.setItem(BOT_HINT_KEY, '1');
  } catch {
    // Хранилище недоступно — хватит флага в памяти
  }
  return true;
}

const openBot = () => openMaxLink(`https://max.ru/${ABOUT.botNick}?start=`);

/** Сколько пропуск можно вернуть, мс: потом он уходит на сервер, и место из ленты пропадает. */
const SKIP_UNDO_MS = 8000;

/** Пропуски, которые ещё можно вернуть (skipQueue.ts). */
const skips = createSkipQueue((id, keepalive) => api.interest(id, 'skipped', { keepalive }), SKIP_UNDO_MS);

/**
 * Колода мест: свайп или кнопки, «Вернуть» последнюю пропущенную, клавиши ← → Z на десктопе.
 * «Интересно» уходит на сервер сразу при вылете; ошибка — карточка въезжает обратно с текстом сервера.
 * «Не интересно» уходит через SKIP_UNDO_MS или при уходе с экрана: до этого «Вернуть» отменяет пропуск без следа.
 */
function Deck({ items, names, filtered, onResetFilter, head }: DeckProps) {
  const navigate = useNavigate();
  const reduced = useReduced();
  const deck = useRef<SwipeDeckHandle>(null);
  const lean = useMotionValue(0);
  const [queue, setQueue] = useState(items);
  const [skipped, setSkipped] = useState<Internship[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const top = queue[0];

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.kind === 'error' ? 5000 : 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), hint.ms);
    return () => window.clearTimeout(t);
  }, [hint]);

  // Плашка с кнопкой и тост — в одной точке сверху: показываем что-то одно, новое сменяет старое
  const showToast = (t: Toast) => {
    setHint(null);
    setToast(t);
  };
  const showHint = (h: Hint) => {
    setToast(null);
    setHint(h);
  };

  // Компания пригласила, пока студент листает колоду, — сразу сказать и открыть «Это тандем!» одним нажатием
  const watchInvite = useInviteWatch((interest) => {
    haptic.notify('success');
    showHint({
      text: `${interest.internship.company.name} пригласила вас`,
      label: 'Открыть',
      ms: 10000,
      onClick: () => {
        setHint(null);
        navigate(tandemPath(interest.internship.id), { state: { interest } satisfies TandemState });
      },
    });
  });

  // Отправленный пропуск вернуть уже нельзя: сервер исключит место из ленты, а отменить пропуск API не умеет.
  // Колоду закрыли, мини-приложение свернули или закрывают — отложенные пропуски уходят сразу и доживают до сервера
  useEffect(() => {
    const unsubscribe = skips.subscribe((ids) => setSkipped((s) => s.filter((p) => !ids.includes(p.id))));
    const release = () => skips.flush(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') release();
    };
    window.addEventListener('pagehide', release);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', release);
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, []);

  const like = async (place: Internship) => {
    try {
      await api.interest(place.id, 'interested');
      haptic.notify('success');
      // Вакансии «Работы России» отвечают на портале — ждать приглашения здесь нечего
      if (place.source !== 'trudvsem') watchInvite(place.id);
      // Демо-компания приглашает сама через ~20 секунд: подсказку про бота оставляем до обычного места
      if (place.isDemo) showToast({ kind: 'ok', text: 'Тестовая компания ответит примерно через 20 секунд' });
      else if (takeBotHint())
        showHint({
          text: 'Отклик отправлен. Когда компания ответит, бот напишет в чат. Не нажимали «Начать»?',
          label: 'Открыть бота',
          ms: 4000,
          onClick: () => {
            setHint(null);
            openBot();
          },
        });
      else showToast({ kind: 'ok', text: 'Отклик отправлен — компания увидит вас в списке кандидатов' });
    } catch (err) {
      haptic.notify('error');
      setQueue((q) => [place, ...q.filter((p) => p.id !== place.id)]);
      showToast({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Не получилось отправить. Повторите.',
      });
    }
  };

  const onSwipe = (place: Internship, dir: SwipeDir) => {
    setQueue((q) => q.filter((p) => p.id !== place.id));
    if (dir === -1) {
      setSkipped((s) => [...s.filter((p) => p.id !== place.id), place]);
      skips.add(place.id);
    } else void like(place);
  };

  const decide = (dir: SwipeDir) => deck.current?.swipe(dir);

  const undo = () => {
    const last = skipped[skipped.length - 1];
    if (!last) return;
    // Пропуск успел уйти на сервер — карточку не возвращаем: место всё равно пропало бы из ленты
    if (!skips.remove(last.id)) {
      setSkipped((s) => s.filter((p) => p.id !== last.id));
      return;
    }
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
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={top.id}
        className="feed-aside-in"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fade}
      >
        <span className="cap">О месте</span>
        <PlaceDetails place={top} names={names} withHead />
      </motion.div>
    </AnimatePresence>
  ) : null;

  const empty = (
    <motion.div className="deck-empty" {...listItem(0, reduced, 0.1)}>
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
    </motion.div>
  );

  return (
    <FeedLayout head={head(queue.length)} aside={aside}>
      <div className={top ? 'feed-deck' : 'feed-deck is-empty'}>
        <SwipeDeck
          ref={deck}
          items={queue}
          getKey={(p) => p.id}
          renderCard={(p, active) => <PlaceCardFace place={p} names={names} active={active} />}
          cardLabel={(p) => `Место: ${p.title}`}
          onSwipe={onSwipe}
          stamps={STAMPS}
          lean={lean}
          empty={empty}
        />
        {top && (
          <div className="acts">
            <DeckButton className="sm" icon={<Icon name="undo" size="sm" />} onClick={undo} disabled={skipped.length === 0}>
              <span className="fab-l">
                Вернуть <span className="kbd">Z</span>
              </span>
            </DeckButton>
            <DeckButton className="nope" side={-1} lean={lean} icon={<Icon name="cross" size="lg" />} onClick={() => decide(-1)}>
              <span className="fab-l">
                Не интересно <span className="kbd">←</span>
              </span>
            </DeckButton>
            <DeckButton className="like" side={1} lean={lean} icon={<Icon name="check" size="lg" />} onClick={() => decide(1)}>
              <span className="fab-l">
                Интересно <span className="kbd">→</span>
              </span>
            </DeckButton>
            <DeckButton className="sm" icon={<Icon name="up" size="sm" />} onClick={() => navigate(`/internships/${top.id}`, { state: { asStudent: true } })}>
              Подробнее
            </DeckButton>
          </div>
        )}
      </div>
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.text}
            className={`toast ${toast.kind}`}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={reduced ? fade : spring}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {hint && (
          <motion.div
            key={hint.text}
            className="bot-hint"
            role="status"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={reduced ? fade : spring}
          >
            <span className="grow">{hint.text}</span>
            <button type="button" className="btn sm sec" onClick={hint.onClick}>
              {hint.label}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </FeedLayout>
  );
}

/** Лента студента «Для вас»: фильтр тегами и колода мест. */
export function StudentFeed() {
  const { me } = useMe();
  const scanner = useScanPlace();
  const [tags, setTags] = useState<string[]>([]);
  const [tagsState] = useLoad(loadTags, []);
  const [state, retry] = useLoad(async () => {
    // Смена фильтра закрывает колоду, и её пропуски уходят на сервер: ждём ответа, иначе пропущенные места вернутся
    await skips.settled(3000);
    const [feed, skills, own] = await Promise.all([
      api.feed(tags),
      loadSkills(),
      me.roles.employer ? loadOwnPlaces(tags) : Promise.resolve([]),
    ]);
    return { items: withOwnFirst(own, feed.items), names: skillNames(skills) };
  }, [tags.join(','), me.roles.employer]);

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
        {/* Режим ярмарки: QR-код на стенде компании → карточка места */}
        <button type="button" className="ibtn feed-scan" aria-label="Сканировать QR-код места" title="Сканировать QR-код места" onClick={scanner.scan}>
          <Icon name="qr" size="sm" />
        </button>
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
                <i className="dot" style={{ background: tagColor(t.code) }} />
                {t.name}
              </button>
            );
          })}
        </div>
      )}
    </>
  );

  const notice = <ScanNotice problem={scanner.problem} onRetry={scanner.scan} onClose={scanner.dismiss} />;

  if (state.status === 'loading') {
    return (
      <>
        <FeedLayout head={head('loading')}>
          <DeckSkeleton />
        </FeedLayout>
        {notice}
      </>
    );
  }
  if (state.status === 'error') {
    return (
      <>
        <FeedLayout head={head('error')}>
          <ErrorState error={state.error} onRetry={retry} />
        </FeedLayout>
        {notice}
      </>
    );
  }
  return (
    <>
      <Deck
        items={state.data.items}
        names={state.data.names}
        filtered={tags.length > 0}
        onResetFilter={() => setTags([])}
        head={head}
      />
      {notice}
    </>
  );
}
