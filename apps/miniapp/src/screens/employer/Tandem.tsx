// «Это тандем!» у компании (макет c2 EmployerMatch): сразу после приглашения — контакт студента и что дальше.
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { useData } from '../../api/useData';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { haptic } from '../../max/bridge';
import { fade, meet, pop, spring, useReduced } from '../../motion/springs';
import { listItem } from '../../motion/variants';
import { accusative, avatarClass, firstName, initial, loadPlaceData, paths } from './candidate';
import { ContactBlock } from './CandidateCard';
import type { TandemState } from './Candidates';
import { logoLetter } from './cover';
import { CheckIcon } from './icons';
import './employer.css';
import './places.css';

/** Задержка «галочки» после старта сфер и текста — после неё (как у студента). */
const CHECK_DELAY = 0.15;
const TEXT_DELAY = 0.32;

const readState = (state: unknown): TandemState =>
  typeof state === 'object' && state !== null ? (state as TandemState) : {};

export function EmployerTandemScreen() {
  const params = useParams();
  const id = Number(params.id);
  const studentId = Number(params.studentId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(studentId) || studentId <= 0) {
    return <Navigate to="/employer" replace />;
  }
  return <Tandem key={`${id}-${studentId}`} id={id} studentId={studentId} />;
}

function Tandem({ id, studentId }: { id: number; studentId: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  const passed = readState(location.state);
  // Сферы съезжаются только сразу после приглашения, при возврате «Назад» — без анимации
  const [fresh] = useState(() => passed.justInvited === true);
  const data = useData(() => loadPlaceData(id), [id]);
  const reduced = useReduced();

  useEffect(() => {
    if (!fresh) return;
    navigate(location.pathname, { replace: true, state: { ...passed, justInvited: false } satisfies TandemState });
    // Один раз при появлении экрана
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Первый показ — из перехода, без ожидания сети; потом — свежие данные
  const loaded = data.state.status === 'ok' ? data.state.data : null;
  const place = loaded?.place ?? passed.place ?? null;
  const c =
    loaded?.items.find((x) => x.studentId === studentId) ??
    (passed.candidate?.studentId === studentId ? passed.candidate : null);

  if (!place || !c) {
    if (data.state.status === 'loading') {
      return (
        <main className="screen emp">
          <Skeleton lines={3} height={120} />
        </main>
      );
    }
    if (data.state.status === 'error') {
      return (
        <main className="screen emp">
          <ErrorState error={data.state.error} onRetry={data.retry} />
        </main>
      );
    }
    return <Navigate to={paths.candidates(id)} replace />;
  }
  // Приглашения ещё нет (открыли адрес вручную) — к кандидатам
  if (c.status !== 'invited') return <Navigate to={paths.candidates(id)} replace />;

  const waiting = loaded ? loaded.items.filter((x) => x.status === 'interested').length : null;
  const name = firstName(c);

  const next = () => {
    haptic.selection();
    if (waiting === 0) navigate(`${paths.candidates(id)}?tab=invited`, { replace: true });
    else navigate(`${paths.candidates(id)}?view=cards`, { replace: true });
  };

  // Один раз: сферы навстречу → «галочка» → текст снизу (пружины из motion/springs, как у студента);
  // при возврате «Назад» — без анимации. Тактильный отклик уже был — вместе с ответом сервера на приглашение.
  const sphere = (side: 1 | -1) =>
    !fresh
      ? { initial: false as const }
      : reduced
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: fade }
        : { initial: { x: side * 80, scale: 0.8, opacity: 0 }, animate: { x: 0, scale: 1, opacity: 1 }, transition: meet };
  const check = !fresh
    ? { initial: false as const }
    : reduced
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { ...fade, delay: 0.1 } }
      : { initial: { scale: 0 }, animate: { scale: 1 }, transition: { ...pop, delay: CHECK_DELAY } };
  const rise = (delay: number) =>
    !fresh
      ? { initial: false as const }
      : reduced
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { ...fade, delay: 0.1 } }
        : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay } };
  const item = (i: number) => (fresh ? listItem(i, reduced, reduced ? 0.15 : TEXT_DELAY + 0.12) : { initial: false as const });

  return (
    <main className="screen emp etm">
      <div className="etm-glow-clip" aria-hidden="true">
        <motion.div
          className="etm-glow"
          {...(fresh ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { ...fade, duration: 0.5 } } : { initial: false })}
        />
      </div>
      <section className="etm-body">
        <div className="etm-pair" aria-hidden="true">
          <motion.span className="ava etm-orb etm-co" {...sphere(-1)}>
            {logoLetter(place.company.name)}
          </motion.span>
          <motion.span className={`ava etm-orb ${avatarClass(c.studentId)}`} {...sphere(1)}>
            {initial(c)}
          </motion.span>
          <motion.span className="etm-check" {...check}>
            <CheckIcon className="ic" />
          </motion.span>
        </div>
        <div className="etm-head">
          <motion.h1 className="etm-h" {...rise(TEXT_DELAY)}>
            Это тандем!
          </motion.h1>
          <motion.p className="lead" {...rise(TEXT_DELAY + 0.06)}>
            Вы пригласили {accusative(name)} на «{place.title}». Бот уже отправил студенту ваш контакт и{' '}
            {/* по дефису «чек-лист» рвался, и «лист» оставался один на строке */}
            <span style={{ whiteSpace: 'nowrap' }}>чек-лист</span>.
          </motion.p>
        </div>
        <motion.div {...item(0)}>
          <ContactBlock c={c} place={place} />
        </motion.div>
        <motion.p className="lbl etm-note" {...item(1)}>
          {c.phone ? 'Имя и телефон студента бот продублировал вам в чат.' : 'Имя студента бот продублировал вам в чат.'}
        </motion.p>
      </section>
      <motion.div className="etm-acts" {...item(2)}>
        <button type="button" className="btn pri" onClick={next}>
          {waiting === 0 ? 'К кандидатам места' : 'Следующий кандидат'}
        </button>
        <Link className="btn ghost" to="/employer">
          К моим местам
        </Link>
      </motion.div>
    </main>
  );
}
