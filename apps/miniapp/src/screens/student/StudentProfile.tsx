import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../../api/client';
import { useLoad } from '../../api/useLoad';
import { useMe } from '../../app/me';
import { DemoBadge } from '../../components/DemoBadge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { useReduced } from '../../motion/springs';
import { listItem } from '../../motion/variants';
import { loadSkills } from './dict';
import { FORMAT_LABEL, FORMATS, MONTHS, nameOf, skillNames } from './place';
import { ProfileFormScreen } from './ProfileForm';
import { RequireConsent, StudentShell } from './StudentShell';
import { Icon, ListSkeleton } from './ui';

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

/** Строка-переход в профиле: иконка, подпись, пояснение и шеврон. */
function LinkRow({ icon, title, text, onClick }: { icon: 'phone' | 'swap' | 'info'; title: string; text?: string; onClick: () => void }) {
  return (
    <button type="button" className="li sp-link" onClick={onClick}>
      <Icon name={icon} size="sm" />
      <span className="col grow">
        <span>{title}</span>
        {text && <span className="lbl">{text}</span>}
      </span>
      <Icon name="chevron" size="sm" style={{ color: 'var(--ink3)' }} />
    </button>
  );
}

/** Профиль студента `/student/profile`: анкета, переход к редактированию, роль работодателя, «О сервисе». */
export function StudentProfileScreen() {
  const navigate = useNavigate();
  const reduced = useReduced();
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
  if (state.status === 'loading') body = <ListSkeleton rows={5} thumb={false} />;
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
        <motion.div className="surf" {...listItem(0, reduced)}>
          <Row k="Вуз" v={p.university} />
          {p.faculty && <Row k="Факультет" v={p.faculty} />}
          <Row k="Направление" v={p.direction} />
          <Row k="Курс" v={String(p.course)} />
          <Row k="Город" v={p.city} />
          {/* В порядке анкеты, а не в порядке, в каком их отмечали */}
          <Row k="Формат" v={FORMATS.filter((f) => p.formats.includes(f)).map((f) => FORMAT_LABEL[f]).join(', ')} />
          {month && <Row k="Месяц практики" v={month} />}
        </motion.div>
        <motion.div className="col" style={{ gap: 8 }} {...listItem(1, reduced)}>
          <span className="cap">Навыки · {p.skills.length}</span>
          <div className="skills">
            {p.skills.map((c) => (
              <span key={c} className="sk ok">
                {nameOf(state.data.names, c)}
              </span>
            ))}
          </div>
        </motion.div>
        <motion.div className="actions" {...listItem(2, reduced)}>
          <button type="button" className="btn pri" onClick={() => navigate('/student/profile/edit')}>
            Изменить анкету
          </button>
          <button type="button" className="btn sec" onClick={() => navigate('/student/profile/edit?step=skills')}>
            Добавить навыки
          </button>
        </motion.div>
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
          <motion.div className="surf" {...listItem(3, reduced)}>
            {!me.hasPhone && (
              <LinkRow
                icon="phone"
                title="Поделиться номером"
                text="Компания увидит его только после приглашения"
                onClick={() => navigate('/consent?next=/student/profile')}
              />
            )}
            <LinkRow
              icon="swap"
              title="Перейти в роль работодателя"
              text={me.roles.employer ? 'Ваши места и кандидаты' : 'Опубликуйте место и получите откликнувшихся студентов'}
              onClick={() => navigate('/employer')}
            />
            <LinkRow icon="info" title="О сервисе" text="Документы и поддержка" onClick={() => navigate('/about')} />
          </motion.div>
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
