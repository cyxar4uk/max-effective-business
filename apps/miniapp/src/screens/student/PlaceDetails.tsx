import { Link } from 'react-router';
import type { Internship, Match } from '../../api/types';
import { openLink } from '../../max/bridge';
import {
  addSkillHref,
  companyInitial,
  matchFormula,
  nameOf,
  placeDates,
  placeFormat,
  placePay,
  placeWhere,
  TYPE_LABEL,
  type SkillNames,
} from './place';
import { Eq, Icon, Pct } from './ui';

function SkillRow({ code, ok, names }: { code: string; ok: boolean; names: SkillNames }) {
  return (
    <div className="row sd-skill">
      <span className={`sk ${ok ? 'ok' : 'no'} sd-mark`}>{ok && <Icon name="check" />}</span>
      <span className={ok ? 'grow' : 'grow sd-miss'}>{nameOf(names, code)}</span>
      {!ok && (
        <Link className="sd-link" to={addSkillHref(code)}>
          Есть? Добавить
        </Link>
      )}
    </div>
  );
}

/** Расшифровка совпадения: процент, формула и навыки с отметками. */
export function MatchBreakdown({ match, names }: { match: Match; names: SkillNames }) {
  const must = [...match.mustMatched.map((c) => [c, true] as const), ...match.mustMissing.map((c) => [c, false] as const)];
  const nice = [...match.niceMatched.map((c) => [c, true] as const), ...match.niceMissing.map((c) => [c, false] as const)];
  return (
    <section className="surf sd-match" aria-label="Совпадение по навыкам">
      <div className="match">
        <Pct score={match.score} size={44} />
        <div className="col" style={{ gap: 6 }}>
          <Eq score={match.score} onSurf />
          <span className="lbl">
            {matchFormula(match).map((line, i) => (
              <span key={i} className="sd-formula">
                {line}
              </span>
            ))}
          </span>
        </div>
      </div>
      {must.length > 0 && <span className="cap">Обязательные</span>}
      {must.map(([code, ok]) => (
        <SkillRow key={code} code={code} ok={ok} names={names} />
      ))}
      {nice.length > 0 && <span className="cap">Желательные</span>}
      {nice.map(([code, ok]) => (
        <SkillRow key={code} code={code} ok={ok} names={names} />
      ))}
    </section>
  );
}

/** Навыки места без анкеты студента: без отметок, просто списком. */
function PlainSkills({ place, names }: { place: Internship; names: SkillNames }) {
  return (
    <section className="surf sd-match" aria-label="Навыки">
      {place.requiredSkills.length > 0 && <span className="cap">Обязательные навыки</span>}
      <div className="skills">
        {place.requiredSkills.map((c) => (
          <span key={c} className="sk no">
            {nameOf(names, c)}
          </span>
        ))}
      </div>
      {place.niceSkills.length > 0 && <span className="cap">Желательные</span>}
      <div className="skills">
        {place.niceSkills.map((c) => (
          <span key={c} className="sk no">
            {nameOf(names, c)}
          </span>
        ))}
      </div>
    </section>
  );
}

function Tile({ k, v }: { k: string; v: string }) {
  return (
    <div className="surf sd-tile">
      <span className="lbl">{k}</span>
      <span className="sd-tile-v">{v}</span>
    </div>
  );
}

interface PlaceDetailsProps {
  place: Internship;
  names: SkillNames;
  /** Заголовок и компания — в боковой панели колоды; на экране места они под обложкой. */
  withHead?: boolean;
}

/** Подробности места: совпадение, условия плитками, описание, контакт. Экран места и панель колоды на десктопе. */
export function PlaceDetails({ place, names, withHead }: PlaceDetailsProps) {
  const dates = placeDates(place);
  const pay = placePay(place);
  const description = place.description?.trim();

  return (
    <div className="sd">
      {withHead && (
        <div className="col" style={{ gap: 6 }}>
          <h2 className="d m0 sd-title">{place.title}</h2>
          <span className="sd-where">
            {place.company.name} · {placeWhere(place)}
          </span>
        </div>
      )}
      {place.match ? <MatchBreakdown match={place.match} names={names} /> : <PlainSkills place={place} names={names} />}
      <div className="sd-tiles">
        <Tile k="Тип" v={TYPE_LABEL[place.type] ?? '—'} />
        <Tile k="Формат" v={placeFormat(place)} />
        {dates && <Tile k="Сроки" v={dates} />}
        {pay && <Tile k="Оплата" v={pay} />}
        {place.slots > 0 && <Tile k="Мест" v={String(place.slots)} />}
      </div>
      {description && (
        <div className="col" style={{ gap: 6 }}>
          <span className="cap">Что делать</span>
          <p className="m0 sd-desc">{description}</p>
        </div>
      )}
      {place.source === 'trudvsem' && place.sourceUrl && (
        <button type="button" className="sd-link sd-source" onClick={() => openLink(place.sourceUrl!)}>
          Источник — «Работа России»
        </button>
      )}
      <div className="surf">
        <div className="li">
          <span className="logo sd-logo">{companyInitial(place.company.name)}</span>
          <div className="col grow">
            <span style={{ fontWeight: 600 }}>{place.company.name}</span>
            <span className="lbl">Контакт откроется после приглашения</span>
          </div>
        </div>
      </div>
    </div>
  );
}
