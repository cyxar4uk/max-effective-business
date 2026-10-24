export type PlaceType = 'practice' | 'internship' | 'part_time';
export type WorkFormat = 'office' | 'remote' | 'hybrid';

/** Поля карточки места, которые черновик подставляет в форму. Всё остальное работодатель заполняет сам. */
export interface DraftCore {
  title: string;
  /** 0–1 код из /api/tags. */
  tags: string[];
  requiredSkills: string[];
  niceSkills: string[];
  /** null — из текста не понять, поле формы не трогаем. */
  type: PlaceType | null;
  format: WorkFormat | null;
}

/** Ответ POST /api/internships/draft. source: 'ai' — от модели, 'rules' — по ключевым словам (не показываем как ИИ). */
export interface PlaceDraft extends DraftCore {
  source: 'ai' | 'rules';
}

/** Обрезать по символам (не по UTF-16): эмодзи не разрезается пополам. Длиннее max — с «…» в конце. */
export function clip(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : s;
}

export const DRAFT_LIMITS = {
  /** Как у места в API. */
  title: 200,
  tags: 1,
  required: 5,
  nice: 6,
  /** Текст работодателя. */
  text: 1000,
} as const;
