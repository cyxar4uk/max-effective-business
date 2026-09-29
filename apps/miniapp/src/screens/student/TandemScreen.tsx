import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { api } from '../../api/client';
import type { Interest } from '../../api/types';
import { useLoad } from '../../api/useLoad';
import { useMe } from '../../app/me';
import { CopyButton } from '../../components/CopyButton';
import { DemoBadge } from '../../components/DemoBadge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { haptic } from '../../max/bridge';
import { fade, meet, pop, spring, useReduced } from '../../motion/springs';
import { listItem } from '../../motion/variants';
import { companyInitial, TYPE_LABEL } from './place';
import { RequireConsent } from './StudentShell';
import { formatPhone, INVITE_TO, inviteSeen, markInviteSeen, nextStepsFor, type TandemState } from './tandem';
import './tandem.css';
import { Icon } from './ui';

/** Позиция в истории: BrowserRouter хранит её в history.state.idx. */
const historyIndex = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0;

/** Задержка «галочки» после старта сфер и заголовка — после неё. */
const CHECK_DELAY = 0.15;
const TEXT_DELAY = 0.32;

function Tandem({ interest, celebrate, fromList }: { interest: Interest; celebrate: boolean; fromList: boolean }) {
  const navigate = useNavigate();
  const { me } = useMe();
  const reduced = useReduced();
  const phoneRef = useRef<HTMLSpanElement>(null);
  const { internship: place, employerContact: contact } = interest;
  const company = place.company.name;
  const steps = nextStepsFor(place.type);

  // Тактильный отклик вместе с «галочкой»
  useEffect(() => {
    if (!celebrate) return;
    const t = window.setTimeout(() => haptic.notify('success'), reduced ? 0 : CHECK_DELAY * 1000);
    return () => window.clearTimeout(t);
  }, [celebrate, reduced]);

  // Один раз: сферы навстречу → «галочка» → заголовок и текст снизу; при повторном открытии — без анимации
  const play = celebrate;
  const sphere = (side: 1 | -1) =>
    !play
      ? { initial: false as const }
      : reduced
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: fade }
        : { initial: { x: side * 80, scale: 0.8, opacity: 0 }, animate: { x: 0, scale: 1, opacity: 1 }, transition: meet };
  const check = !play
    ? { initial: false as const }
    : reduced
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { ...fade, delay: 0.1 } }
      : { initial: { scale: 0 }, animate: { scale: 1 }, transition: { ...pop, delay: CHECK_DELAY } };
  const rise = (delay: number) =>
    !play
      ? { initial: false as const }
      : reduced
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { ...fade, delay: 0.1 } }
        : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay } };
  const item = (i: number) => (play ? listItem(i, reduced, reduced ? 0.15 : TEXT_DELAY + 0.12) : { initial: false as const });

  // Пришли из «Откликов» — возвращаемся туда же (список не перерисуется заново), иначе открываем их вместо этого экрана
  const allInterests = () =>
    fromList && historyIndex() > 0 ? navigate(-1) : navigate('/student/interests', { replace: true });

  return (
    <main className="tm">
      <div className="tm-glow-clip" aria-hidden="true">
        <motion.div
          className="tm-glow"
          {...(play ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { ...fade, duration: 0.5 } } : { initial: false })}
        />
      </div>
      <div className="tm-body">
        <div className="tm-pair" aria-hidden="true">
          <motion.span className="ava tm-ava tm-st" {...sphere(-1)}>
            {companyInitial(me.firstName)}
          </motion.span>
          <motion.span className="ava tm-ava tm-em" {...sphere(1)}>
            {companyInitial(company)}
          </motion.span>
          <motion.span className="tm-check" {...check}>
            <Icon name="check" size="sm" style={{ strokeWidth: 3 }} />
          </motion.span>
        </div>
        <div className="tm-head">
          <motion.h1 className="d m0 tm-h1" {...rise(TEXT_DELAY)}>
            Это тандем!
          </motion.h1>
          <motion.p className="m0 tm-text" {...rise(TEXT_DELAY + 0.06)}>
            {company} приглашает вас на {INVITE_TO[place.type] ?? 'место'} «{place.title}».
          </motion.p>
          {place.isDemo && (
            <motion.span className="tm-demo" {...rise(TEXT_DELAY + 0.06)}>
              <DemoBadge isDemo />
            </motion.span>
          )}
        </div>
        <motion.div className="surf" {...item(0)}>
          {contact ? (
            <div className="li tm-contact">
              <span className="ava tm-logo">{companyInitial(contact.name)}</span>
              <div className="col grow">
                <span className="tm-name">
                  {contact.name}, {company}
                </span>
                {contact.phone ? (
                  <span ref={phoneRef} className="num tm-phone">
                    {formatPhone(contact.phone)}
                  </span>
                ) : (
                  <span className="lbl">Телефон не указан</span>
                )}
              </div>
              {contact.phone && <CopyButton text={contact.phone} target={phoneRef} label="Скопировать номер" />}
            </div>
          ) : (
            <div className="li">
              <span className="lbl">Контакт работодателя бот пришлёт в чат.</span>
            </div>
          )}
        </motion.div>
        <motion.section className="surf tm-steps" aria-label="Что дальше" {...item(1)}>
          <span className="cap">Что дальше · {(TYPE_LABEL[place.type] ?? 'место').toLowerCase()}</span>
          <ol className="tm-list">
            {steps.map((s, i) => (
              <li key={s}>
                <span className="d tm-n">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <span className="lbl">Бот продублирует чек-лист в чат. Ночью, с 22:00 до 9:00, сообщение придёт утром.</span>
        </motion.section>
      </div>
      <motion.div className="tm-acts" {...item(2)}>
        <button type="button" className="btn pri" onClick={() => navigate('/student', { replace: true })}>
          Смотреть другие места
        </button>
        <button type="button" className="btn ghost" onClick={allInterests}>
          Все отклики
        </button>
      </motion.div>
    </main>
  );
}

/**
 * «Это тандем!» `/student/tandem/:id` (id места): приглашение работодателя — контакт и чек-лист следующих шагов.
 * Открывается сам из «Откликов», пока приглашение не видели (id в localStorage), и по нажатию на отклик.
 */
export function TandemScreen() {
  const id = Number(useParams().id);
  const valid = Number.isInteger(id) && id > 0;
  const navigate = useNavigate();
  const { interest: passed, from } = (useLocation().state as TandemState | null) ?? {};
  const [celebrate] = useState(() => valid && !inviteSeen(id));
  const [state, retry] = useLoad(async () => {
    if (passed?.internship.id === id && passed.status === 'invited') return passed;
    const { items } = await api.interests();
    return items.find((i) => i.internship.id === id && i.status === 'invited') ?? null;
  }, [id]);
  const found = state.status === 'ok' && state.data !== null;

  useEffect(() => {
    if (found) markInviteSeen(id);
  }, [found, id]);

  if (!valid) return <Navigate to="/student/interests" replace />;

  let body;
  if (state.status === 'loading')
    body = (
      <main className="screen">
        <Skeleton lines={4} height={80} />
      </main>
    );
  else if (state.status === 'error')
    body = (
      <main className="screen">
        <ErrorState error={state.error} onRetry={retry} />
      </main>
    );
  else if (!state.data)
    body = (
      <main className="screen">
        <EmptyState
          title="Приглашение не найдено"
          text="Возможно, место уже закрыли. Все ваши отклики и их статусы — в «Откликах»."
          actionLabel="К откликам"
          onAction={() => navigate('/student/interests', { replace: true })}
        />
      </main>
    );
  else body = <Tandem interest={state.data} celebrate={celebrate} fromList={from === 'interests'} />;

  return <RequireConsent>{body}</RequireConsent>;
}
