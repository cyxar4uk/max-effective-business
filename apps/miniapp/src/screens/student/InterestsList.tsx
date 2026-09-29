import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../api/client';
import type { Interest, Internship } from '../../api/types';
import { useLoad } from '../../api/useLoad';
import { CopyButton } from '../../components/CopyButton';
import { DemoBadge } from '../../components/DemoBadge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { openLink } from '../../max/bridge';
import { useReduced } from '../../motion/springs';
import { listItem } from '../../motion/variants';
import { coverOf } from './place';
import { formatPhone, tandemPath, takeFreshInvite, type TandemState } from './tandem';
import { Icon, ListSkeleton } from './ui';
import './InterestsList.css';

type Shown = Exclude<Interest['status'], 'skipped'>;
type ShownInterest = Interest & { status: Shown };

/** Статус отклика справа в строке. Приглашения — отдельными карточками «Это тандем» сверху. */
function statusOf(interest: ShownInterest): { label: string; cls: string } {
  const place = interest.internship;
  if (interest.status === 'declined') return { label: 'Отказ', cls: 'no' };
  if (interest.status === 'invited') return { label: 'Это тандем', cls: 'tandem' };
  // Вакансии «Работа России»: работодателя в «Тандеме» нет, ответить некому — откликаются на портале
  if (place.source === 'trudvsem') return { label: 'На портале', cls: 'no' };
  if (place.status === 'closed') return { label: 'Набор закрыт', cls: 'no' };
  return { label: 'Ждём ответа', cls: 'wait' };
}

/** Миниатюра обложки места — тот же градиент по тегу, что у карточки в колоде. */
function Thumb({ place, big }: { place: Internship; big?: boolean }) {
  return (
    <span className={big ? 'thumb ints-thumb-big' : 'thumb'} aria-hidden="true">
      <span className={`cover ${coverOf(place).cls}`} />
    </span>
  );
}

/** «Компания · 85 %». */
function Sub({ interest }: { interest: Interest }) {
  return (
    <span className="lbl">
      {interest.internship.company.name} · {interest.match.score}&nbsp;%
    </span>
  );
}

/** Приглашение: карточка с акцентом ведёт на «Это тандем!», под ней — контакт работодателя. */
function TandemItem({ interest, index }: { interest: ShownInterest; index: number }) {
  const reduced = useReduced();
  const phoneRef = useRef<HTMLSpanElement>(null);
  const { internship: place, employerContact: contact } = interest;
  const state: TandemState = { interest, from: 'interests' };
  return (
    <motion.article className="surf ints-tandem" {...listItem(index, reduced)}>
      <Link to={tandemPath(place.id)} state={state} className="li ints-head">
        <Thumb place={place} big />
        <span className="col grow ints-text">
          <span className="st tandem">Это тандем</span>
          <strong className="ints-title">{place.title}</strong>
          <Sub interest={interest} />
          <DemoBadge isDemo={place.isDemo} />
        </span>
        <Icon name="chevron" size="sm" style={{ color: 'var(--ink3)' }} />
      </Link>
      {contact && (
        <div className="li ints-contact">
          <div className="col grow">
            <span className="cap">Контакт работодателя</span>
            <span className="ints-name">{contact.name}</span>
            {contact.phone ? (
              <span ref={phoneRef} className="num ints-phone">
                {formatPhone(contact.phone)}
              </span>
            ) : (
              <span className="lbl">Телефон не указан</span>
            )}
            {contact.phone && (
              <div className="row ints-acts">
                <a className="btn sm pri" href={`tel:${contact.phone}`}>
                  Позвонить
                </a>
                {/* tel: в MAX может не открыться — номер можно скопировать всегда */}
                <CopyButton text={contact.phone} target={phoneRef} label="Скопировать номер" />
              </div>
            )}
          </div>
        </div>
      )}
    </motion.article>
  );
}

/** Отклик без приглашения: ждёт ответа, отказ, место закрыто или вакансия с портала. */
function InterestRow({ interest, index }: { interest: ShownInterest; index: number }) {
  const reduced = useReduced();
  const place = interest.internship;
  const status = statusOf(interest);
  const external = place.source === 'trudvsem' && interest.status === 'interested' && place.sourceUrl;
  return (
    <motion.li {...listItem(index, reduced)}>
      {/* asStudent: своё место из колоды («Ваше место») открываем глазами студента, а не списком кандидатов */}
      <Link to={`/internships/${place.id}`} state={{ asStudent: true }} className="li">
        <Thumb place={place} />
        <span className="col grow ints-text">
          <strong className="ints-title">{place.title}</strong>
          <Sub interest={interest} />
          <DemoBadge isDemo={place.isDemo} />
        </span>
        <span className={`st ${status.cls}`}>{status.label}</span>
      </Link>
      {external && (
        <div className="li ints-ext">
          <span className="lbl grow">Работодателя этой вакансии нет в «Тандеме» — откликнитесь на портале.</span>
          <button type="button" className="btn sm sec" onClick={() => openLink(place.sourceUrl!)}>
            Открыть
          </button>
        </div>
      )}
    </motion.li>
  );
}

/**
 * Список «Мои отклики»: приглашения («Это тандем») сверху, дальше остальные, новые сверху (порядок сервера).
 * Контакт работодателя сервер отдаёт только после приглашения (docs/api.md). Новое приглашение, которое студент
 * ещё не видел, открывается само — экраном «Это тандем!». Состояния загрузки, ошибки и пустоты — здесь же.
 */
export function InterestsList() {
  const navigate = useNavigate();
  const [state, retry] = useLoad(() => api.interests(), []);

  useEffect(() => {
    if (state.status !== 'ok') return;
    const fresh = takeFreshInvite(state.data.items);
    if (fresh) {
      const next: TandemState = { interest: fresh, from: 'interests' };
      navigate(tandemPath(fresh.internship.id), { state: next });
    }
  }, [state, navigate]);

  if (state.status === 'loading') return <ListSkeleton rows={4} />;
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={retry} />;

  const items = state.data.items.filter((i): i is ShownInterest => i.status !== 'skipped');
  if (items.length === 0) {
    return (
      <EmptyState
        title="Откликов пока нет"
        text="Нажмите «Интересно» на подходящем месте — отклик появится здесь, а ответ компании придёт в чат с ботом."
        actionLabel="К местам"
        onAction={() => navigate('/student')}
      />
    );
  }

  const tandems = items.filter((i) => i.status === 'invited');
  const rest = items.filter((i) => i.status !== 'invited');
  return (
    <div className="ints">
      {tandems.map((i, k) => (
        <TandemItem key={i.internship.id} interest={i} index={k} />
      ))}
      {rest.length > 0 && (
        <ul className="surf ints-list">
          {rest.map((i, k) => (
            <InterestRow key={i.internship.id} interest={i} index={tandems.length + k} />
          ))}
        </ul>
      )}
      <p className="m0 lbl ints-note">
        Пропущенные места сюда не попадают. Пропустили случайно — нажмите «Вернуть» в колоде сразу после свайпа.
      </p>
    </div>
  );
}
