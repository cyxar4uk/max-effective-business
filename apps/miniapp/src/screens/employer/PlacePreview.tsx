import type { InternshipType, WorkFormat } from '../../api/types';
import { cityOf, rub, shortDate, slotsText, TYPE_LABEL, type Dict, type Draft } from './draft';

/** Обложка карточки по первому тегу — как в ленте студента. */
const COVERS: Record<string, { cls: string; label: string }> = {
  marketplaces: { cls: 'cv-market', label: 'Маркет-\nплейсы' },
  spreadsheets: { cls: 'cv-data', label: 'Таблицы' },
  website: { cls: 'cv-site', label: 'Сайт' },
  one_c: { cls: 'cv-1c', label: '1С' },
  social_ads: { cls: 'cv-social', label: 'Соцсети' },
  sales: { cls: 'cv-sales', label: 'Продажи' },
};

const FORMAT_WORD: Record<WorkFormat, string> = { office: 'офис', hybrid: 'гибрид', remote: 'удалённо' };
const MAX_SKILLS = 6;

/** Буква для логотипа: «ООО «Вектор»» → «В». */
function logoLetter(company: string): string {
  const name = company.replace(/^(ооо|ип|ао|пао|зао|оао|нко)\s+/i, '');
  return (/[\p{L}\p{N}]/u.exec(name)?.[0] ?? '·').toUpperCase();
}

function coverOf(tags: string[], type: InternshipType | null): { cls: string; label: string } {
  const byTag = tags.map((t) => COVERS[t]).find(Boolean);
  return byTag ?? { cls: 'pf-cv-plain', label: type ? TYPE_LABEL[type] : 'Новое место' };
}

/** Карточка места так, как её увидит студент в ленте. Процента пока нет — у каждого студента он свой. */
export function PlacePreview({ draft, dict }: { draft: Draft; dict: Dict }) {
  const cover = coverOf(draft.tags, draft.type);
  const longLabel = cover.label.split('\n').some((line) => line.length > 8);

  const typeChip = [
    draft.type ? TYPE_LABEL[draft.type] : 'Тип места',
    draft.paid === true ? 'оплачивается' : draft.paid === false ? 'без оплаты' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const city = cityOf(draft, dict.defaultCity);
  const where =
    draft.format === 'remote'
      ? FORMAT_WORD.remote
      : [draft.format ? FORMAT_WORD[draft.format] : null, city].filter(Boolean).join(', ');

  const facts = [
    draft.paid && draft.salary ? `${rub(draft.salary)} в месяц` : null,
    draft.startsOn && draft.endsOn ? `${shortDate(draft.startsOn)} — ${shortDate(draft.endsOn)}` : null,
    slotsText(draft.slots),
  ]
    .filter(Boolean)
    .join(' · ');

  const skills = [
    ...draft.requiredSkills.map((code) => ({ code, nice: false })),
    ...draft.niceSkills.map((code) => ({ code, nice: true })),
  ];
  const shown = skills.slice(0, MAX_SKILLS);
  const more = skills.length - shown.length;

  return (
    <div className="pf-card-wrap">
      <article className="card" aria-label="Так карточку увидят студенты">
        <div className={`cover ${cover.cls}`} aria-hidden="true">
          <span className="cv-ring" style={{ width: 280, height: 280, right: -90, top: -70 }} />
          <span className="cv-ring" style={{ width: 170, height: 170, right: -30, top: -10 }} />
          <div className={longLabel ? 'cv-label long' : 'cv-label'}>{cover.label}</div>
        </div>
        <div className="topchips">
          <span className="gchip">{typeChip}</span>
        </div>
        <div className="shade" />
        <div className="info">
          <div className="col" style={{ gap: 8 }}>
            <h2 className="title pf-card-title">{draft.title.trim() || 'Задача для студента'}</h2>
            <div className="row">
              <span className="logo" aria-hidden="true">
                {logoLetter(dict.companyName)}
              </span>
              <span className="pf-card-co">{[dict.companyName, where].filter(Boolean).join(' · ')}</span>
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
                <span key={s.code} className={s.nice ? 'sk no' : 'sk pf-req'}>
                  {dict.skillName.get(s.code) ?? s.code}
                </span>
              ))}
              {more > 0 && <span className="sk no">+{more}</span>}
            </div>
          )}
          <div className="facts">{facts}</div>
        </div>
      </article>
    </div>
  );
}
