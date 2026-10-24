import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../api/client';
import type { Interest, InterestAction, InterestStatus } from '../api/types';
import { useLoad } from '../api/useLoad';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { backTo, STUDENT_TABS } from '../app/history';
import type { AsStudentState, LaunchState, OwnLinkState } from '../app/launchState';
import { useMe } from '../app/me';
import { parsePlaceId } from '../app/placeParam';
import { copyText } from '../app/clipboard';
import { placeLink, placeLinkText, placeShareText } from '../app/placeLink';
import { Toast } from '../components/Toast';
import { useToast } from '../components/useToast';
import { haptic, shareMaxContent } from '../max/bridge';
import { loadSkills } from './student/dict';
import { companyInitial, coverOf, placeWhere, skillNames, TYPE_LABEL } from './student/place';
import { PlaceDetails } from './student/PlaceDetails';
import { useInviteWatch } from './student/inviteWatch';
import { inviteSeen, tandemPath, type TandemState } from './student/tandem';
import { Cover, Icon } from './student/ui';
import { DemoBadge } from '../components/DemoBadge';

const notFound = () => Promise.reject(new ApiError(404, 'NOT_FOUND', 'Место не найдено'));

const STATUS: Record<InterestStatus, { label: string; text: string; cls: string }> = {
  interested: { label: 'Вы откликнулись', text: 'Компания увидит вас в списке кандидатов. О приглашении бот напишет в чат.', cls: 'wait' },
  skipped: { label: 'Вы пропустили это место', text: 'Передумали? Отклик ещё можно отправить.', cls: 'no' },
  invited: { label: 'Это тандем', text: 'Компания пригласила вас. Контакт и следующие шаги — по кнопке ниже и в чате с ботом.', cls: 'tandem' },
  declined: { label: 'Компания выбрала другого кандидата', text: 'Посмотрите другие подходящие места.', cls: 'no' },
};

/**
 * Карточка места (открывается и по параметру запуска `internship_<id>`).
 * Владельцу сразу показываем кандидатов — так работает кнопка «Кандидаты» из уведомления бота.
 * Студенту — расшифровка совпадения, условия и отклик.
 */
export function InternshipScreen() {
  // Только цифры и не больше integer в базе: «1e1» или огромный id на сервер не уходят
  const parsed = parsePlaceId(useParams().id);
  const valid = parsed !== null;
  const id = parsed ?? 0;
  const navigate = useNavigate();
  const { me } = useMe();
  // Своё место из колоды студента («Ваше место»), сканера или «Посмотреть как студент» — глазами студента,
  // а не списком кандидатов
  const nav = useLocation().state as (AsStudentState & LaunchState) | null;
  const asStudent = nav?.asStudent === true;
  const fromLaunch = nav?.launch === true;
  const [state, retry] = useLoad(
    () => (valid ? Promise.all([api.internship(id), loadSkills()]) : notFound()),
    [id],
  );
  const isOwner = state.status === 'ok' && state.data[0].isOwner === true && !asStudent;
  // Отклик, отправленный с этого экрана: поверх того, что пришло с сервера
  const [sent, setSent] = useState<{ id: number; status: InterestStatus } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useToast();
  // Приглашение пришло, пока экран открыт: статус и плашка с переходом на «Это тандем!»
  const [invited, setInvited] = useState<Interest | null>(null);
  const watchInvite = useInviteWatch((interest) => {
    haptic.notify('success');
    setSent({ id: interest.internship.id, status: 'invited' });
    setInvited(interest);
  });
  useEffect(() => {
    if (!invited) return;
    const t = window.setTimeout(() => setInvited(null), 10000);
    return () => window.clearTimeout(t);
  }, [invited]);
  // Кнопка бота «Открыть приглашение» ведёт сюда: непросмотренное приглашение — сразу «Это тандем!»,
  // заменой записи, чтобы «Назад» не возвращал на карточку места
  const toTandem =
    state.status === 'ok' &&
    !asStudent &&
    state.data[0].match !== undefined &&
    state.data[0].myInterest === 'invited' &&
    !inviteSeen(id);
  useEffect(() => {
    if (toTandem) navigate(tandemPath(id), { replace: true });
  }, [toTandem, id, navigate]);

  useEffect(() => {
    if (!isOwner) return;
    // По ссылке на своё место (QR камерой, кнопка бота) — к кандидатам с плашкой «Посмотреть как студент»
    const state: OwnLinkState | undefined = fromLaunch ? { ownLink: true } : undefined;
    navigate(`/employer/internships/${id}/candidates`, { replace: true, state });
  }, [isOwner, fromLaunch, id, navigate]);

  /**
   * «К местам для вас»: в колоду студента, а без анкеты студента (работодатель открыл ссылку на чужое место) — на выбор
   * роли, а не в онбординг. Раздел студента уже позади («Подробнее», сканер, «Отклики») — возвращаемся в него,
   * а не кладём ленту второй записью поверх
   */
  const student = me.roles.student || (state.status === 'ok' && state.data[0].match !== undefined);
  const toPlaces = () => (student ? backTo(navigate, '/student', STUDENT_TABS) : backTo(navigate, '/'));
  const placesLabel = student ? 'К местам для вас' : 'На главный';

  if (!valid) return <Navigate to="/" replace />;

  if (state.status === 'loading' || isOwner || toTandem) {
    return (
      <main className="screen">
        <Skeleton lines={3} height={120} />
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="screen">
        {state.error.code === 'NOT_FOUND' ? (
          <EmptyState
            title="Место не найдено"
            text="Возможно, его уже закрыли. Посмотрите другие подходящие места."
            actionLabel={placesLabel}
            onAction={toPlaces}
          />
        ) : (
          <ErrorState error={state.error} onRetry={retry} />
        )}
      </main>
    );
  }

  const [place, skills] = state.data;
  const names = skillNames(skills);
  const cover = coverOf(place);
  const interest = sent?.id === place.id ? sent.status : (place.myInterest ?? null);
  const isStudent = place.match !== undefined;
  const closed = place.status === 'closed';

  const act = async (action: InterestAction) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.interest(place.id, action);
      setSent({ id: place.id, status: res.status });
      if (action === 'interested') {
        haptic.notify('success');
        if (place.source !== 'trudvsem') watchInvite(place.id);
        if (place.isDemo) setToast({ kind: 'ok', text: 'Тестовая компания ответит примерно через 20 секунд' });
      } else haptic.impact('light');
    } catch (err) {
      haptic.notify('error');
      setError(err instanceof ApiError ? err.message : 'Не получилось отправить. Повторите.');
    } finally {
      setBusy(false);
    }
  };

  /** Поделиться местом в MAX; вне MAX — скопировать ссылку. Вызов — прямо из нажатия: так требует MAX. */
  const share = () => {
    const link = placeLink(place.id);
    if (shareMaxContent({ text: placeShareText(place), link })) {
      haptic.impact('light');
      return;
    }
    void copyText(link).then((ok) => {
      haptic.notify(ok ? 'success' : 'warning');
      setToast(
        ok
          ? { kind: 'ok', text: 'Ссылка на место скопирована — отправьте её другу' }
          : { kind: 'error', text: `Не получилось скопировать. Ссылка: ${placeLinkText(place.id)}` },
      );
    });
  };

  /**
   * Без анкеты: онбординг и анкета, потом — обратно на это место (QR на ярмарке, ссылка друга). Место передаём
   * адресом (`?place=`): его несёт и `next` онбординга, а «Не сейчас» уводит с этой записи и забывает его.
   */
  const fillProfile = () => navigate(`/student?place=${place.id}`);

  // Закрытое место — сразу «Место закрыто», даже без анкеты: онбординг ради него не нужен
  let bar: ReactNode;
  if (isStudent && interest) {
    const s = STATUS[interest];
    bar = (
      <>
        <div className="pd-status">
          <span className={`st ${s.cls}`}>{s.label}</span>
          <span className="lbl">{s.text}</span>
        </div>
        {interest === 'invited' ? (
          <button type="button" className="btn pri" onClick={() => navigate(tandemPath(place.id))}>
            Контакт и следующие шаги
          </button>
        ) : interest === 'skipped' && !closed ? (
          <button type="button" className="btn pri" onClick={() => act('interested')} disabled={busy}>
            <Icon name="check" size="sm" style={{ strokeWidth: 2.6 }} />
            Всё-таки интересно
          </button>
        ) : (
          <button type="button" className="btn sec" onClick={toPlaces}>
            {placesLabel}
          </button>
        )}
      </>
    );
  } else if (closed) {
    bar = (
      <>
        <p className="m0 lbl pd-note">Место закрыто — отклики больше не принимаются.</p>
        <button type="button" className="btn sec" onClick={toPlaces}>
          {placesLabel}
        </button>
      </>
    );
  } else if (!isStudent) {
    bar = (
      <>
        <p className="m0 lbl pd-note">Заполните анкету — покажем, насколько место вам подходит, и вернём сюда.</p>
        <button type="button" className="btn pri" onClick={fillProfile}>
          Заполнить анкету
        </button>
      </>
    );
  } else {
    bar = (
      <div className="row pd-acts">
        <button type="button" className="fab nope" aria-label="Не интересно" onClick={() => act('skipped')} disabled={busy}>
          <span className="c pd-nope">
            <Icon name="cross" />
          </span>
        </button>
        <button type="button" className="btn pri grow" onClick={() => act('interested')} disabled={busy}>
          <Icon name="check" size="sm" style={{ strokeWidth: 2.6 }} />
          {busy ? 'Отправляем…' : 'Интересно'}
        </button>
      </div>
    );
  }

  return (
    <main className="pd">
      <div className="pd-cover">
        <Cover cls={cover.cls} label={cover.label} labelBottom />
        <div className="topchips pd-top">
          <span className="gchip">{TYPE_LABEL[place.type] ?? 'Место'}</span>
          <span className="row pd-top-r">
            <DemoBadge isDemo={place.isDemo} onCover />
            <button type="button" className="pd-share" aria-label="Поделиться местом" title="Поделиться местом" onClick={share}>
              <Icon name="share" size="sm" />
            </button>
          </span>
        </div>
      </div>
      <div className="pd-body">
        <div className="col" style={{ gap: 8 }}>
          <h1 className="d m0 pd-title">{place.title}</h1>
          <div className="row">
            <span className="logo">{companyInitial(place.company.name)}</span>
            <span className="sd-where">
              {place.company.name} · {placeWhere(place)}
            </span>
          </div>
        </div>
        <PlaceDetails place={place} names={names} />
      </div>
      <div className="pd-bar">
        {error && (
          <p className="m0 pd-error" role="alert">
            {error}
          </p>
        )}
        {bar}
      </div>
      <Toast toast={invited ? null : toast} />
      {invited && (
        <div className="bot-hint" role="status">
          <span className="grow">{invited.internship.company.name} пригласила вас</span>
          <button
            type="button"
            className="btn sm sec"
            onClick={() => navigate(tandemPath(invited.internship.id), { state: { interest: invited } satisfies TandemState })}
          >
            Открыть
          </button>
        </div>
      )}
    </main>
  );
}
