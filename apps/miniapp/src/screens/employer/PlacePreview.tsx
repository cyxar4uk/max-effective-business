import { useState, type ReactNode } from 'react';
import type { InternshipType } from '../../api/types';
import { COVERS, logoLetter, TYPE_COVER_LABEL, type Cover } from './cover';
import { cityOf, FORMAT_LABEL, rub, shortDate, slotsText, TYPE_LABEL, type Dict, type Draft } from './draft';
import { Swap } from './ui';

const MAX_SKILLS = 6;

/** Без тега обложку в ленте выбирает сервер по номеру места — до публикации показываем обложку с типом места. */
function coverOf(tags: string[], type: InternshipType | null): Cover {
  const byTag = tags.map((t) => COVERS[t]).find(Boolean);
  return byTag ?? { cls: 'cv-data', label: type ? TYPE_COVER_LABEL[type] : 'Новое место' };
}

interface CoverArtProps {
  cover: Cover;
  className?: string;
  onAnimationEnd?: () => void;
}

function CoverArt({ cover, className, onAnimationEnd }: CoverArtProps) {
  return (
    <div
      className={`cover ${cover.cls}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      onAnimationEnd={onAnimationEnd}
    >
      {cover.cls === 'cv-data' ? (
        <div className="cv-grid" />
      ) : (
        <>
          <span className="cv-ring" style={{ width: 280, height: 280, right: -90, top: -70 }} />
          <span className="cv-ring" style={{ width: 170, height: 170, right: -30, top: -10 }} />
        </>
      )}
      <div className="cv-label" lang="ru">
        {cover.label}
      </div>
    </div>
  );
}

/** Смена обложки — новая проявляется поверх старой за 150 мс, старая убирается после. */
function CrossfadeCover({ cover }: { cover: Cover }) {
  const id = `${cover.cls}|${cover.label}`;
  const [layers, setLayers] = useState([{ id, cover, n: 0 }]);
  const top = layers[layers.length - 1];
  if (top.id !== id) setLayers([top, { id, cover, n: top.n + 1 }]);
  return layers.map((l, i) =>
    i === layers.length - 1 && l.n > 0 ? (
      <CoverArt key={l.n} cover={l.cover} className="pf-fade-in" onAnimationEnd={() => setLayers((ls) => ls.slice(-1))} />
    ) : (
      <CoverArt key={l.n} cover={l.cover} />
    ),
  );
}

/** Части строки через « · »: пустые пропускаем. */
function Dotted({ parts }: { parts: [string, ReactNode][] }) {
  return (
    <>
      {parts.map(([key, node], i) => (
        <span key={key}>
          {i > 0 && ' · '}
          {node}
        </span>
      ))}
    </>
  );
}

/**
 * Карточка места так, как её увидит студент в ленте. Процента пока нет — у каждого студента он свой.
 * На десктопе обновляется вживую: обложка и выбранные значения сменяются проявлением, набранный текст — сразу.
 */
export function PlacePreview({ draft, dict }: { draft: Draft; dict: Dict }) {
  const cover = coverOf(draft.tags, draft.type);

  const typeChip = [
    draft.type ? TYPE_LABEL[draft.type] : 'Тип места',
    draft.paid === true ? 'оплачивается' : draft.paid === false ? 'без оплаты' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const city = cityOf(draft, dict.defaultCity);
  const format = draft.format ? FORMAT_LABEL[draft.format].toLowerCase() : null;
  const showCity = draft.format !== 'remote' && city;

  const where: [string, ReactNode][] = [];
  if (dict.companyName) where.push(['co', dict.companyName]);
  if (format || showCity) {
    where.push([
      'where',
      <>
        {format && <Swap text={format} />}
        {format && showCity && ', '}
        {showCity && city}
      </>,
    ]);
  }

  const facts: [string, ReactNode][] = [];
  if (draft.paid && draft.salary) facts.push(['pay', `${rub(draft.salary)} в месяц`]);
  if (draft.startsOn && draft.endsOn) {
    facts.push(['dates', <Swap text={`${shortDate(draft.startsOn)} — ${shortDate(draft.endsOn)}`} />]);
  }
  facts.push(['slots', <Swap text={slotsText(draft.slots)} />]);

  const skills = [
    ...draft.requiredSkills.map((code) => ({ code, nice: false })),
    ...draft.niceSkills.map((code) => ({ code, nice: true })),
  ];
  const shown = skills.slice(0, MAX_SKILLS);
  const more = skills.length - shown.length;

  return (
    <div className="pf-card-wrap">
      <article className="card" aria-label="Так карточку увидят студенты">
        <CrossfadeCover cover={cover} />
        <div className="topchips">
          <span className="gchip">
            <Swap text={typeChip} />
          </span>
        </div>
        <div className="shade" />
        <div className="info">
          <div className="col" style={{ gap: 8 }}>
            <h2 className="title pf-card-title">{draft.title.trim() || 'Задача для студента'}</h2>
            <div className="row">
              <span className="logo" aria-hidden="true">
                {logoLetter(dict.companyName)}
              </span>
              <span className="pf-card-co">
                <Dotted parts={where} />
              </span>
            </div>
          </div>
          <div className="match">
            <span className="pct pf-pct-none" aria-label="Процент совпадения">
              —<small>%</small>
            </span>
            <span className="lbl">у каждого студента свой процент совпадения</span>
          </div>
          {shown.length > 0 && (
            <div className="skills">
              {shown.map((s) => (
                <span key={s.code} className={s.nice ? 'sk no pf-fade-in' : 'sk pf-req pf-fade-in'}>
                  {dict.skillName.get(s.code) ?? s.code}
                </span>
              ))}
              {more > 0 && <span className="sk no">+{more}</span>}
            </div>
          )}
          <div className="facts">
            <Dotted parts={facts} />
          </div>
        </div>
      </article>
    </div>
  );
}
