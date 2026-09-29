// Обложка места по тегу — как в ленте студента (screens/student/place.ts): форма места, «Мои места», кандидаты.
import type { Internship, InternshipType } from '../../api/types';

/** Мягкий перенос — кодом, чтобы в исходнике не было невидимых символов. */
const SHY = String.fromCharCode(0xad);

export interface Cover {
  cls: string;
  label: string;
}

/** Обложка карточки по первому тегу. */
export const COVERS: Record<string, Cover> = {
  marketplaces: { cls: 'cv-market', label: `Маркет${SHY}плейсы` },
  spreadsheets: { cls: 'cv-data', label: 'Таблицы' },
  website: { cls: 'cv-site', label: 'Сайт' },
  one_c: { cls: 'cv-1c', label: '1С' },
  social_ads: { cls: 'cv-social', label: `Соц${SHY}сети` },
  sales: { cls: 'cv-sales', label: 'Продажи' },
};

const COVER_CLASSES = ['cv-market', 'cv-data', 'cv-site', 'cv-1c', 'cv-social', 'cv-sales'];

export const TYPE_COVER_LABEL: Record<InternshipType, string> = {
  practice: `Прак${SHY}тика`,
  internship: `Стажи${SHY}ровка`,
  part_time: `Подра${SHY}ботка`,
};

/** Опубликованное место: по первому известному тегу, без тега — по номеру места, как в ленте студента. */
export function placeCover(place: Pick<Internship, 'id' | 'tags' | 'type'>): Cover {
  const byTag = place.tags.map((t) => COVERS[t]).find(Boolean);
  if (byTag) return byTag;
  return { cls: COVER_CLASSES[Math.abs(place.id) % COVER_CLASSES.length], label: TYPE_COVER_LABEL[place.type] ?? '' };
}

/** Цвет точки тега — токен из tokens.css (--tag-…). */
export const tagDot = (place: Pick<Internship, 'tags'>): string | null => {
  const tag = place.tags.find((t) => COVERS[t]);
  return tag ? `var(--tag-${tag})` : null;
};

/** Буква для логотипа: «ООО «Вектор»» → «В». */
export function logoLetter(company: string): string {
  const name = company.replace(/^\s*(ооо|оао|зао|пао|ао|ип|нко|ано)\s+/i, '');
  return (/[\p{L}\p{N}]/u.exec(name)?.[0] ?? '·').toUpperCase();
}
