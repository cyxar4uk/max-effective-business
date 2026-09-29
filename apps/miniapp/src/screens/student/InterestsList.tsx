import { Link, useNavigate } from 'react-router';
import { api } from '../../api/client';
import type { Interest, Internship, WorkFormat } from '../../api/types';
import { useLoad } from '../../api/useLoad';
import { ABOUT } from '../../app/about';
import { DemoBadge } from '../../components/DemoBadge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { openLink, openMaxLink } from '../../max/bridge';
import './InterestsList.css';

type Shown = Exclude<Interest['status'], 'skipped'>;

const STATUS: Record<Shown, { label: string; cls: string }> = {
  interested: { label: 'Ждёт ответа', cls: 'wait' },
  invited: { label: 'Вас пригласили', cls: 'tandem' },
  declined: { label: 'Отказ', cls: 'no' },
};

const FORMAT: Record<WorkFormat, string> = { office: 'в офисе', hybrid: 'гибрид', remote: 'удалённо' };

/** «удалённо» / «в офисе, Москва» — как placeWhere в экранах студента. */
function where(place: Internship): string {
  if (place.format === 'remote') return FORMAT.remote;
  const city = place.city ?? place.company.city;
  return city ? `${FORMAT[place.format]}, ${city}` : FORMAT[place.format];
}

const openBot = () => openMaxLink(`https://max.ru/${ABOUT.botNick}?start=`);

/**
 * Список «Мои отклики»: места, где студент нажал «Интересно», новые сверху, со статусом ответа работодателя.
 * Контакт работодателя сервер отдаёт только после приглашения (docs/api.md). Состояния загрузки, ошибки и пустоты — здесь же.
 */
export function InterestsList() {
  const navigate = useNavigate();
  const [state, retry] = useLoad(() => api.interests(), []);

  if (state.status === 'loading') return <Skeleton lines={4} />;
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={retry} />;

  const items = state.data.items.filter((i): i is Interest & { status: Shown } => i.status !== 'skipped');
  if (items.length === 0) {
    return (
      <EmptyState
        title="Откликов пока нет"
        text="Нажмите «Интересно» на подходящем месте — отклик появится здесь."
        actionLabel="К местам"
        onAction={() => navigate('/student')}
      />
    );
  }

  return (
    <ul className="stack-v interests">
      {items.map((i) => (
        <InterestItem key={i.internship.id} interest={i} />
      ))}
    </ul>
  );
}

function InterestItem({ interest }: { interest: Interest & { status: Shown } }) {
  const { internship: place, employerContact: contact } = interest;
  // Вакансии «Работа России»: работодателя в «Тандеме» нет, ответить некому — откликаются на портале
  const external = place.source === 'trudvsem';
  const status =
    external && interest.status === 'interested' ? { label: 'Отклик — на «Работа России»', cls: 'no' } : STATUS[interest.status];

  return (
    <li className="surf">
      <Link to={`/internships/${place.id}`} className="li">
        <div className="col grow">
          <strong>{place.title}</strong>
          <span className="lbl">
            {place.company.name} · {where(place)}
          </span>
          <div className="row">
            <span className={`st ${status.cls}`}>{status.label}</span>
            {place.status === 'closed' && interest.status === 'interested' && <span className="st no">Место закрыто</span>}
            <DemoBadge isDemo={place.isDemo} />
          </div>
        </div>
        <span className="pct pct-sm">
          {interest.match.score}
          <small>%</small>
        </span>
      </Link>
      {external && place.sourceUrl && (
        <div className="li contact">
          <span className="lbl grow">Работодателя этой вакансии нет в «Тандеме» — откликнитесь на портале.</span>
          <button type="button" className="btn sm sec" onClick={() => openLink(place.sourceUrl!)}>
            Открыть
          </button>
        </div>
      )}
      {interest.status === 'invited' && contact && (
        <div className="li contact">
          <div className="col grow">
            <span className="cap">Контакт работодателя</span>
            <strong>{contact.name}</strong>
            {contact.phone ? <span className="num">{contact.phone}</span> : <span className="lbl">Телефон не указан</span>}
            {/* Бот не пишет с 22:00 до 9:00 — поэтому не «прислал», а «пришлёт» */}
            <span className="lbl">Чек-лист следующих шагов бот пришлёт в чат (с 22:00 до 9:00 — утром).</span>
            <div className="row contact-acts">
              {contact.phone && (
                <a className="btn sm pri" href={`tel:${contact.phone}`}>
                  Позвонить
                </a>
              )}
              <button type="button" className="btn sm sec" onClick={openBot}>
                Чат с ботом
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
