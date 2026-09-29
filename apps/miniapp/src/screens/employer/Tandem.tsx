// «Это тандем!» у компании (макет c2 EmployerMatch): сразу после приглашения — контакт студента и что дальше.
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { useData } from '../../api/useData';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { haptic } from '../../max/bridge';
import { accusative, avatarClass, firstName, initial, loadPlaceData, paths } from './candidate';
import { ContactBlock } from './CandidateCard';
import type { TandemState } from './Candidates';
import { logoLetter } from './cover';
import { CheckIcon } from './icons';
import './employer.css';
import './places.css';

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
  // Шары съезжаются только сразу после приглашения, при возврате «Назад» — без анимации
  const [fresh] = useState(() => passed.justInvited === true);
  const data = useData(() => loadPlaceData(id), [id]);

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

  return (
    <main className={fresh ? 'screen emp tm tm-fresh' : 'screen emp tm'}>
      <div className="tm-glow" aria-hidden="true" />
      <section className="tm-body">
        <div className="tm-orbs" aria-hidden="true">
          <span className="tm-orb tm-co">{logoLetter(place.company.name)}</span>
          <span className={`tm-orb tm-st ${avatarClass(c.studentId)}`}>{initial(c)}</span>
          <span className="tm-ck">
            <CheckIcon className="ic" />
          </span>
        </div>
        <div className="tm-text tm-rise">
          <h1 className="tm-h">Это тандем!</h1>
          <p className="lead">
            Вы пригласили {accusative(name)} на «{place.title}». Бот уже отправил студенту ваш контакт и чек-лист.
          </p>
        </div>
        <div className="tm-rise tm-r2">
          <ContactBlock c={c} place={place} />
        </div>
        <p className="lbl tm-note tm-rise tm-r3">
          {c.phone ? 'Имя и телефон студента бот продублировал вам в чат.' : 'Имя студента бот продублировал вам в чат.'}
        </p>
      </section>
      <div className="actions tm-foot tm-rise tm-r4">
        <button type="button" className="btn pri" onClick={next}>
          {waiting === 0 ? 'К кандидатам места' : 'Следующий кандидат'}
        </button>
        <Link className="btn ghost" to="/employer">
          К моим местам
        </Link>
      </div>
    </main>
  );
}
