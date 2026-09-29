// QR для стенда (макет c3 Fair): карточка-плакат места с QR-кодом диплинка, «Поделиться в MAX», ссылка и показ
// кода на весь экран. Плакат всегда светлый — его печатают и показывают с телефона; остальной экран — по теме.
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../../api/client';
import type { Internship } from '../../api/types';
import { useLoad } from '../../api/useLoad';
import { copyText, selectText } from '../../app/clipboard';
import { placeLink, placeLinkText, placeShareText } from '../../app/placeLink';
import { parsePlaceId } from '../../app/placeParam';
import { CopyButton } from '../../components/CopyButton';
import { ErrorState } from '../../components/ErrorState';
import { QrCode } from '../../components/QrCode';
import { Toast } from '../../components/Toast';
import { useToast } from '../../components/useToast';
import { haptic, shareMaxContent } from '../../max/bridge';
import { fade, spring, useReduced } from '../../motion/springs';
import { placePay } from '../student/place';
import { TYPE_TITLE } from './candidate';
import { placeCover } from './cover';
import { CrossIcon, ExpandIcon, ShareIcon } from './icons';
import './employer.css';
import './places.css';
import './qr.css';

/** Точка, из которой раскрывается «На весь экран»: центр нажатой кнопки или кода (px от левого верхнего угла окна). */
interface Origin {
  x: number;
  y: number;
}

/** Состояние перехода в истории: «На весь экран» открыт с этого экрана — закрываем шагом назад. */
interface FullState {
  fullFromHere?: boolean;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** «ООО «Вектор» · практика · 25 000 ₽ в месяц». */
function metaLine(place: Internship): string {
  const pay = placePay(place);
  return [place.company.name, lowerFirst(TYPE_TITLE[place.type] ?? 'Место'), pay && lowerFirst(pay)].filter(Boolean).join(' · ');
}

export function PlaceQr() {
  // Только цифры и не больше integer в базе: «1e1» или огромный id на сервер не уходят
  const id = parsePlaceId(useParams().id);
  if (id === null) return <Navigate to="/employer" replace />;
  return <QrScreen key={id} id={id} />;
}

function QrScreen({ id }: { id: number }) {
  const [state, retry] = useLoad(() => api.internship(id), [id]);

  return (
    <main className="screen emp qr">
      <header className="qr-head">
        <h1 className="h1 qr-h1">QR для стенда</h1>
        <span className="lbl">Студент наводит камеру — и сразу в карточке места</span>
      </header>
      {state.status === 'loading' ? (
        <div className="qr-skel" role="status" aria-busy="true" aria-label="Загрузка">
          <div className="skeleton-line qr-skel-poster" />
          <div className="skeleton-line qr-skel-btn" />
        </div>
      ) : state.status === 'error' ? (
        state.error.code === 'NOT_FOUND' ? (
          <section className="state">
            <h2 className="state-title d">Место не найдено</h2>
            <p className="state-text">Возможно, его открыли по старой ссылке. Ваши места — в «Моих местах».</p>
            <Link className="btn pri" to="/employer" replace>
              К моим местам
            </Link>
          </section>
        ) : (
          <ErrorState error={state.error} onRetry={retry} />
        )
      ) : (
        <Poster place={state.data} />
      )}
    </main>
  );
}

function Poster({ place }: { place: Internship }) {
  const reduced = useReduced();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [toast, setToast] = useToast();
  const [origin, setOrigin] = useState<Origin | null>(null);
  const linkRef = useRef<HTMLSpanElement>(null);
  const link = placeLink(place.id);
  const cover = placeCover(place);
  const full = params.get('view') === 'full';
  const closed = place.status === 'closed';

  const openFull = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    haptic.impact('light');
    // Отдельный шаг истории: «Назад» в MAX закрывает показ, а не уходит с экрана
    setParams({ view: 'full' }, { state: { fullFromHere: true } satisfies FullState });
  };

  const closeFull = () => {
    if ((location.state as FullState | null)?.fullFromHere) navigate(-1);
    else setParams({}, { replace: true });
  };

  const share = () => {
    // Вызов — прямо из нажатия: MAX открывает экран шеринга только после клика пользователя
    if (shareMaxContent({ text: placeShareText(place), link })) {
      haptic.impact('light');
      return;
    }
    // Вне MAX поделиться нечем — копируем ссылку
    void copyText(link).then((ok) => {
      if (ok) {
        haptic.notify('success');
        setToast({ kind: 'ok', text: 'Ссылка скопирована — отправьте её в чат' });
        return;
      }
      if (linkRef.current) selectText(linkRef.current);
      haptic.notify('warning');
      setToast({ kind: 'error', text: 'Не получилось скопировать: ссылка под кнопками выделена — скопируйте её' });
    });
  };

  const rise = (delay: number) =>
    reduced
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { ...fade, delay } }
      : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay } };

  return (
    <>
      {closed && (
        <div className="surf qr-closed" role="status">
          <span className="cd-closed-t">Набор закрыт</span>
          <span className="lbl">
            По коду студенты откроют место, но откликнуться не смогут. Откройте набор снова на экране кандидатов.
          </span>
        </div>
      )}
      <motion.article className="qr-poster qr-light" aria-label={`Плакат места «${place.title}»`} {...rise(0)}>
        <div className="qr-cover">
          <span className={`cover ${cover.cls}`} aria-hidden="true">
            {cover.cls === 'cv-data' && <span className="cv-grid" />}
            <span className="cv-label qr-cover-label" lang="ru">
              {cover.label}
            </span>
          </span>
        </div>
        <div className="qr-body">
          <h2 className="d qr-title">{place.title}</h2>
          <span className="lbl qr-meta">{metaLine(place)}</span>
          <button type="button" className="qr-code" onClick={openFull} aria-label="Показать QR-код на весь экран">
            <QrCode value={link} label={`QR-код места «${place.title}»`} className="qr-svg" />
          </button>
          <span className="qr-hint">Наведите камеру телефона</span>
          <span className="row lbl qr-brand">
            <span className="qr-dots" aria-hidden="true">
              <i />
              <i />
            </span>
            тандем · бот в MAX
          </span>
        </div>
      </motion.article>
      <motion.div className="qr-actions" {...rise(0.06)}>
        <button type="button" className="btn pri" onClick={share}>
          <ShareIcon />
          Поделиться в MAX
        </button>
        <div className="qr-row">
          <CopyButton text={link} target={linkRef} className="btn sec" label="Скопировать ссылку" />
          <button type="button" className="btn sec" onClick={openFull}>
            <ExpandIcon />
            На весь экран
          </button>
        </div>
        <p className="lbl m0 qr-link">
          Ссылка: <span ref={linkRef}>{placeLinkText(place.id)}</span>
        </p>
      </motion.div>
      <AnimatePresence>{full && <FullQr key="full" place={place} link={link} origin={origin} onClose={closeFull} />}</AnimatePresence>
      <Toast toast={toast} />
    </>
  );
}

interface FullQrProps {
  place: Internship;
  link: string;
  origin: Origin | null;
  onClose: () => void;
}

/**
 * Код на весь экран — показать с телефона у стенда: белый фон и код во всю ширину. Яркость экрана пока не поднимаем:
 * метод Bridge для этого ещё не внесён в docs/05_max_platform.md. Раскрывается из нажатой кнопки; при reduced
 * motion — проявление.
 */
function FullQr({ place, link, origin, onClose }: FullQrProps) {
  const reduced = useReduced();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [from] = useState<Origin>(() => origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 });

  // Фокус — на «Закрыть», после закрытия — обратно; Esc закрывает
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => opener?.focus?.({ preventScroll: true });
  }, []);
  // Закрываем один раз: повторный Esc или двойное нажатие не должны увести ещё на шаг назад
  const closed = useRef(false);
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });
  const closeOnce = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    latest.current();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeOnce();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeOnce]);

  return (
    <motion.div
      className="qr-full qr-light"
      role="dialog"
      aria-modal="true"
      aria-label="QR-код места на весь экран"
      style={{ transformOrigin: `${from.x}px ${from.y}px` }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.2 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.2 }}
      transition={reduced ? fade : { scale: spring, opacity: { ...fade, duration: 0.18 } }}
    >
      <button ref={closeRef} type="button" className="ibtn qr-full-close" aria-label="Закрыть" onClick={closeOnce}>
        <CrossIcon className="ic sm" />
      </button>
      <div className="qr-full-in">
        <QrCode value={link} label={`QR-код места «${place.title}»`} className="qr-full-svg" />
        <p className="d m0 qr-full-title">{place.title}</p>
        <p className="m0 qr-full-hint">Наведите камеру телефона</p>
      </div>
    </motion.div>
  );
}
