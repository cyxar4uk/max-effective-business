import { Link } from 'react-router';
import type { Internship, Match } from '../../api/types';
import { closeOf } from '../../app/matchText';
import { openLink } from '../../max/bridge';
import {
  addSkillHref,
  companyInitial,
  matchFormula,
  nameOf,
  placeDates,
  placeFormat,
  placePayTile,
  placeWhere,
  TYPE_LABEL,
  type SkillNames,
} from './place';
import { Eq, Icon, Pct } from './ui';

/** close — близкий навык студента, которым требование закрыто наполовину (#71). */
function SkillRow({ code, ok, close, names }: { code: string; ok: boolean; close?: string; names: SkillNames }) {
  return (
    <div className="row sd-skill">
      <span className={`sk ${ok ? 'ok' : 'no'} sd-mark`} aria-hidden={close ? true : undefined}>
        {ok ? <Icon name="check" /> : close && '≈'}
      </span>
      <span className={ok ? 'grow' : 'grow sd-miss'}>
        {nameOf(names, code)}
        {close && <span className="sd-close">есть близкий: {nameOf(names, close)} — засчитано наполовину</span>}
      </span>
      {!ok && (
        <Link className="sd-link" to={addSkillHref(code)}>
          Умею — добавить
        </Link>
      )}
    </div>
  );
}

/** Расшифровка совпадения: процент, формула и навыки с отметками. */
export function MatchBreakdown({ match, names }: { match: Match; names: SkillNames }) {
  const must = [...match.mustMatched.map((c) => [c, true] as const), ...match.mustMissing.map((c) => [c, false] as const)];
  const nice = [...match.niceMatched.map((c) => [c, true] as const), ...match.niceMissing.map((c) => [c, false] as const)];
  const close = closeOf(match);
  return (
    <section className="surf sd-match" aria-label="Совпадение по навыкам">
      <div className="match">
        <Pct score={match.score} size={44} />
        <div className="col" style={{ gap: 6 }}>
          <Eq score={match.score} onSurf />
          <span className="lbl">{matchFormula(match)}</span>
        </div>
      </div>
      {must.length > 0 && <span className="cap">Обязательные</span>}
      {must.map(([code, ok]) => (
        <SkillRow key={code} code={code} ok={ok} close={ok ? undefined : close.get(code)} names={names} />
      ))}
      {nice.length > 0 && <span className="cap">Желательные</span>}
      {nice.map(([code, ok]) => (
        <SkillRow key={code} code={code} ok={ok} close={ok ? undefined : close.get(code)} names={names} />
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

function Tile({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={wide ? 'surf sd-tile sd-tile-wide' : 'surf sd-tile'}>
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

/**
 * Подробности места: условия плитками (оплата первой — студент решает по деньгам и графику), совпадение, описание,
 * контакт. Экран места и панель колоды на десктопе.
 */
export function PlaceDetails({ place, names, withHead }: PlaceDetailsProps) {
  const dates = placeDates(place);
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
      <div className="sd-tiles">
        <Tile k="Оплата" v={placePayTile(place)} wide />
        {dates && <Tile k="Сроки" v={dates} />}
        <Tile k="Формат" v={placeFormat(place)} />
        <Tile k="Тип" v={TYPE_LABEL[place.type] ?? '—'} />
        {place.slots > 0 && <Tile k="Мест" v={String(place.slots)} />}
      </div>
      {place.match ? <MatchBreakdown match={place.match} names={names} /> : <PlainSkills place={place} names={names} />}
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
