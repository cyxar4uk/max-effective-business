import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../../api/client';
import { useLoad } from '../../api/useLoad';
import { useMe } from '../../app/me';
import { DemoBadge } from '../../components/DemoBadge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { loadSkills } from './dict';
import { FORMAT_LABEL, MONTHS, nameOf, skillNames } from './place';
import { ProfileFormScreen } from './ProfileForm';
import { RequireConsent, StudentShell } from './StudentShell';
import { Icon } from './ui';

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="li sp-row">
      <span className="lbl">{k}</span>
      <span className="sp-v">{v}</span>
    </div>
  );
}

function monthLabel(value: string | null | undefined): string | null {
  const m = value ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  return m ? `${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}` : null;
}

/** Профиль студента `/student/profile`: анкета, переход к редактированию, смена роли. */
export function StudentProfileScreen() {
  const navigate = useNavigate();
  const { me } = useMe();
  const [state, retry] = useLoad(async () => {
    const profile = api.studentProfile().catch((err: unknown) => {
      if (err instanceof ApiError && err.code === 'NOT_FOUND') return null;
      throw err;
    });
    const [p, s] = await Promise.all([profile, loadSkills()]);
    return { profile: p, names: skillNames(s) };
  }, []);

  const name = [me.firstName, me.lastName].filter(Boolean).join(' ');

  let body: ReactNode;
  if (state.status === 'loading') body = <Skeleton lines={4} height={56} />;
  else if (state.status === 'error') body = <ErrorState error={state.error} onRetry={retry} />;
  else if (!state.data.profile)
    body = (
      <EmptyState
        title="Анкеты пока нет"
        text="Заполните короткую анкету — и мы покажем только подходящие места."
        actionLabel="Заполнить анкету"
        onAction={() => navigate('/student')}
      />
    );
  else {
    const p = state.data.profile;
    const month = monthLabel(p.practiceMonth);
    body = (
      <>
        <DemoBadge isDemo={p.isDemo === true} />
        <div className="surf">
          <Row k="Вуз" v={p.university} />
          {p.faculty && <Row k="Факультет" v={p.faculty} />}
          <Row k="Направление" v={p.direction} />
          <Row k="Курс" v={String(p.course)} />
          <Row k="Город" v={p.city} />
          <Row k="Формат" v={p.formats.map((f) => FORMAT_LABEL[f]).join(', ')} />
          {month && <Row k="Месяц практики" v={month} />}
        </div>
        <div className="col" style={{ gap: 8 }}>
          <span className="cap">Навыки · {p.skills.length}</span>
          <div className="skills">
            {p.skills.map((c) => (
              <span key={c} className="sk ok">
                {nameOf(state.data.names, c)}
              </span>
            ))}
          </div>
        </div>
        <div className="actions">
          <button type="button" className="btn pri" onClick={() => navigate('/student/profile/edit')}>
            Изменить анкету
          </button>
          <button type="button" className="btn sec" onClick={() => navigate('/student/profile/edit?step=skills')}>
            Добавить навыки
          </button>
        </div>
      </>
    );
  }

  return (
    <RequireConsent>
      <StudentShell>
        <main className="sp">
          <div className="top sp-top">
            <div className="col" style={{ gap: 2 }}>
              <h1 className="d m0 feed-h1">Профиль</h1>
              {name && <span className="lbl">{name}</span>}
            </div>
          </div>
          {body}
          <div className="surf">
            {!me.hasPhone && (
              <button type="button" className="li sp-link" onClick={() => navigate('/consent?next=/student/profile')}>
                <Icon name="phone" size="sm" />
                <span className="col grow">
                  <span>Поделиться номером</span>
                  <span className="lbl">Компания увидит его только после приглашения</span>
                </span>
              </button>
            )}
            <button type="button" className="li sp-link" onClick={() => navigate('/employer')}>
              <Icon name="doc" size="sm" />
              <span className="grow">Перейти в роль работодателя</span>
            </button>
          </div>
        </main>
      </StudentShell>
    </RequireConsent>
  );
}

/** Редактирование анкеты `/student/profile/edit` (`?step=skills&add=<код>` — сразу к навыкам). */
export function StudentProfileEdit() {
  return (
    <RequireConsent>
      <ProfileFormScreen mode="edit" />
    </RequireConsent>
  );
}
