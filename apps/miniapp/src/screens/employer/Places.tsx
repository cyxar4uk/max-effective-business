// «Мои места»: плитки мест как плейлисты — обложка по тегу, сколько откликов и сколько ждут решения.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../api/client';
import type { GuideState } from '../CheckGuide';
import type { Internship } from '../../api/types';
import { useLoad } from '../../api/useLoad';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { DemoBadge } from '../../components/DemoBadge';
import { haptic } from '../../max/bridge';
import { responsesText } from './candidate';
import { plural } from './draft';
import { BuildingIcon, ChevronIcon, PlusIcon, RouteIcon } from './icons';
import { PlaceArt } from './PlaceArt';
import './employer.css';
import './places.css';

/** Лимит сервера на открытые места (docs/api.md, 409). */
const OPEN_LIMIT = 20;

type Filter = 'open' | 'closed';

const counts = (p: Internship) => p.counts ?? { interested: 0, invited: 0, declined: 0 };

/** Подпись под плиткой: что с откликами. */
function statusText(p: Internship): string {
  const c = counts(p);
  const total = c.interested + c.invited + c.declined;
  const invited = c.invited > 0 ? `${c.invited} ${plural(c.invited, ['приглашён', 'приглашены', 'приглашены'])}` : null;
  if (p.status === 'closed') return ['Набор закрыт', invited].filter(Boolean).join(' · ');
  if (total === 0) return 'Разослали · откликов пока нет';
  if (c.interested > 0) return `${responsesText(total)} · ${c.interested} ${plural(c.interested, ['ждёт', 'ждут', 'ждут'])}`;
  return [responsesText(total), invited].filter(Boolean).join(' · ');
}

function PlaceTile({ place, index }: { place: Internship; index: number }) {
  const waiting = counts(place).interested;
  const status = statusText(place);
  return (
    <Link
      to={`/employer/internships/${place.id}/candidates`}
      className="pl-tile cd-in"
      style={{ animationDelay: `${Math.min(index, 10) * 20}ms` }}
      aria-label={`${place.title}. ${status}`}
      onClick={() => haptic.selection()}
    >
      <span className="pl-art">
        <PlaceArt place={place} variant="tile" />
        {waiting > 0 && (
          <span className="pl-badge num" aria-hidden="true">
            {waiting}
          </span>
        )}
      </span>
      <span className="pl-title">{place.title}</span>
      <span className="lbl">{status}</span>
      <DemoBadge isDemo={place.isDemo} />
    </Link>
  );
}

function NewTile({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="pl-tile pl-new cd-in" onClick={onClick}>
      <span className="pl-art pl-new-art">
        <PlusIcon className="ic lg" />
        <span className="pl-new-t">Новое место</span>
        <span className="lbl">около 3 минут</span>
      </span>
    </button>
  );
}

export function Places() {
  const navigate = useNavigate();
  const [state, retry] = useLoad(api.employerInternships, []);
  const [filter, setFilter] = useState<Filter>('open');

  const create = () => {
    haptic.selection();
    navigate('/employer/new');
  };

  const places = state.status === 'ok' ? state.data.items : [];
  const open = places.filter((p) => p.status === 'open');
  const closed = places.filter((p) => p.status === 'closed');
  const shown = filter === 'open' ? open : closed;
  const company = places[0]?.company.name;

  return (
    <main className="screen emp pl">
      <header className="pl-head">
        <div className="col grow">
          <h1 className="h1">Мои места</h1>
          {state.status === 'ok' && places.length > 0 && (
            <span className="lbl">
              {company ? `${company} · ` : ''}открыто {open.length} из {OPEN_LIMIT}
            </span>
          )}
        </div>
        <button type="button" className="ibtn pl-add" aria-label="Новое место" onClick={create}>
          <PlusIcon className="ic" />
        </button>
      </header>
      <button type="button" className="pl-howto" onClick={() => navigate('/', { state: { guide: true } satisfies GuideState })}>
        <span className="pl-howto-ic" aria-hidden="true">
          <RouteIcon />
        </span>
        <span className="col grow">
          <span className="pl-howto-t">Как проверить за 5 минут</span>
          <span className="lbl">Весь сценарий одним аккаунтом: компания и студент</span>
        </span>
        <ChevronIcon />
      </button>

      {state.status === 'loading' ? (
        <Skeleton lines={2} height={180} />
      ) : state.status === 'error' ? (
        <ErrorState error={state.error} onRetry={retry} />
      ) : places.length === 0 ? (
        <section className="pl-empty cd-in">
          <h2 className="h2">Создайте первое место — это около 3 минут</h2>
          <p className="lead">
            Опишите задачу и нужные навыки. Бот сам отправит карточку студентам, которым она подходит, а отклики появятся
            здесь.
          </p>
          <button type="button" className="btn pri" onClick={create}>
            <PlusIcon />
            Создать место
          </button>
        </section>
      ) : (
        <>
          <div className="pl-bar">
            <div className="chips" role="group" aria-label="Какие места показать">
              <button type="button" className={filter === 'open' ? 'chip on' : 'chip'} aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>
                Открытые · {open.length}
              </button>
              {closed.length > 0 && (
                <button
                  type="button"
                  className={filter === 'closed' ? 'chip on' : 'chip'}
                  aria-pressed={filter === 'closed'}
                  onClick={() => setFilter('closed')}
                >
                  Закрытые · {closed.length}
                </button>
              )}
            </div>
          </div>
          <div key={filter} className="pl-grid cd-fade">
            {shown.map((p, i) => (
              <PlaceTile key={p.id} place={p} index={i} />
            ))}
            {filter === 'open' && <NewTile onClick={create} />}
          </div>
          {filter === 'closed' && closed.length === 0 && <p className="lbl">Закрытых мест нет.</p>}
        </>
      )}

      <nav className="pl-links" aria-label="Ещё">
        <button type="button" className="btn ghost sm" onClick={() => navigate('/employer/profile')}>
          <BuildingIcon />
          Профиль компании
        </button>
        <button type="button" className="btn ghost sm" onClick={() => navigate('/')}>
          Сменить роль
        </button>
      </nav>
    </main>
  );
}
