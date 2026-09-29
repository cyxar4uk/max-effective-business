import type { Internship } from '../../api/types';
import { companyInitial, coverOf, nameOf, placeFacts, placeWhere, typeChip, type SkillNames } from './place';
import { Cover, Eq, Icon, Pct } from './ui';

/** Сколько навыков помещается на карточке, остальное — «+N». */
const CARD_SKILLS = 6;

/**
 * Лицевая сторона карточки места в колоде: обложка по тегу, задача, компания, совпадение, навыки, условия.
 * active — карточка верхняя: эквалайзер «вырастает».
 */
export function PlaceCardFace({ place, names, active }: { place: Internship; names: SkillNames; active: boolean }) {
  const cover = coverOf(place);
  const match = place.match;
  const skills = match
    ? [
        ...[...match.mustMatched, ...match.niceMatched].map((c) => [c, true] as const),
        ...[...match.mustMissing, ...match.niceMissing].map((c) => [c, false] as const),
      ]
    : [];
  const facts = placeFacts(place);
  return (
    <>
      <Cover cls={cover.cls} label={cover.label} />
      <div className="topchips">
        <span className="gchip">{typeChip(place)}</span>
        {place.isDemo && <span className="gchip demo">тестовые данные</span>}
      </div>
      <div className="shade" />
      <div className="info">
        <div className="col" style={{ gap: 8 }}>
          <h2 className="title">{place.title}</h2>
          <div className="row">
            <span className="logo">{companyInitial(place.company.name)}</span>
            <span className="pc-where">
              {place.company.name} · {placeWhere(place)}
            </span>
          </div>
        </div>
        {match && (
          <div className="match">
            <Pct score={match.score} />
            <div className="col" style={{ gap: 6 }}>
              <Eq score={match.score} grow={active} />
              <span className="lbl">совпадение по навыкам</span>
            </div>
          </div>
        )}
        {skills.length > 0 && (
          <div className="skills pc-skills">
            {skills.slice(0, CARD_SKILLS).map(([code, ok]) => (
              <span key={code} className={`sk ${ok ? 'ok' : 'no'}`}>
                {ok && <Icon name="check" />}
                <span className="pc-sk-name">{nameOf(names, code)}</span>
              </span>
            ))}
            {skills.length > CARD_SKILLS && <span className="sk no">+{skills.length - CARD_SKILLS}</span>}
          </div>
        )}
        {facts && <div className="facts">{facts}</div>}
      </div>
    </>
  );
}
