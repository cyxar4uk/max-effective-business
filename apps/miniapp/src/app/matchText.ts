// Совпадение человеческим языком: одна фраза над чипами навыков, уровень для эквалайзера, счёт «2/2 · 1/3».
// Общее для работодателя (кандидаты) и студента (карточка места). Названия навыков — из GET /api/skills.
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Match, SkillCode, Skills } from '../api/types';

/** Код навыка → название. Неизвестный код показываем как есть. */
export type SkillNames = ReadonlyMap<SkillCode, string>;

export function skillNamesOf(skills: Skills): SkillNames {
  return new Map(skills.groups.flatMap((g) => g.skills.map((s) => [s.code, s.name] as const)));
}

let cache: Promise<SkillNames> | null = null;

/** Справочник меняется только с выкладкой сервера: грузим раз за сеанс, при ошибке — заново при следующем вызове. */
export function loadSkillNames(): Promise<SkillNames> {
  if (!cache) {
    cache = api.skills().then(skillNamesOf);
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

const NO_NAMES: SkillNames = new Map();

/** Названия навыков для экрана. Пока справочник грузится или не загрузился — коды (skillName их покажет как есть). */
export function useSkillNames(): SkillNames {
  const [names, setNames] = useState<SkillNames>(NO_NAMES);
  useEffect(() => {
    let alive = true;
    loadSkillNames().then(
      (loaded) => alive && setNames(loaded),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return names;
}

export const skillName = (names: SkillNames, code: SkillCode): string => names.get(code) ?? code;

const CYR_UPPER = /^[А-ЯЁ][а-яё]/;

/** Название внутри фразы: «Юнит-экономика» → «юнит-экономика»; бренды и сокращения (Excel, SQL, 1С) — как есть. */
function inPhrase(name: string): string {
  return CYR_UPPER.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}

/** «a», «a и b», «a, b и ещё 2». */
function list(names: string[], max = 2): string {
  if (names.length <= max) return names.length === 2 ? `${names[0]} и ${names[1]}` : names.join(', ');
  return `${names.slice(0, max).join(', ')} и ещё ${names.length - max}`;
}

/** Недостающий навык → близкий навык студента, которым он закрыт наполовину (#71). */
export function closeOf(match: Match): ReadonlyMap<SkillCode, SkillCode> {
  return new Map([...(match.mustClose ?? []), ...(match.niceClose ?? [])].map((c) => [c.need, c.have] as const));
}

/** Сколько закрыто с половинками за близкие навыки: «2», «1,5». */
export function closedCount(matched: number, close: number): string {
  return String(matched + close / 2).replace('.', ',');
}

/**
 * Одна фраза о совпадении:
 * «Закрывает все навыки» · «Закрывает все обязательные, нет: юнит-экономика» · «Не хватает обязательного: Wildberries».
 */
export function matchText(match: Match, names: SkillNames): string {
  const close = closeOf(match);
  // «Wildberries (есть Ozon)»: близкий навык засчитан наполовину, но навыка из требований у студента нет
  const missing = (codes: SkillCode[]) =>
    codes.map((c) => {
      const name = inPhrase(skillName(names, c));
      const have = close.get(c);
      return have ? `${name} (есть ${inPhrase(skillName(names, have))})` : name;
    });
  const mustAll = match.mustMatched.length + match.mustMissing.length;
  const niceAll = match.niceMatched.length + match.niceMissing.length;

  if (match.mustMissing.length > 0) {
    const n = match.mustMissing.length;
    return `Не хватает ${n === 1 ? 'обязательного' : 'обязательных'}: ${list(missing(match.mustMissing))}`;
  }
  if (mustAll === 0 && niceAll === 0) return 'Особых навыков место не требует';
  if (match.niceMissing.length === 0) return 'Закрывает все навыки';
  if (mustAll === 0) return `Нет желательных: ${list(missing(match.niceMissing))}`;
  return `Закрывает все обязательные, нет: ${list(missing(match.niceMissing))}`;
}

/** «обязательные 2/2 · желательные 1/3», близкий навык — половина: «1,5/2»; без желательных — только обязательные. */
export function matchCounts(match: Match): string {
  const mustAll = match.mustMatched.length + match.mustMissing.length;
  const niceAll = match.niceMatched.length + match.niceMissing.length;
  const parts: string[] = [];
  if (mustAll > 0) parts.push(`обязательные ${closedCount(match.mustMatched.length, match.mustClose?.length ?? 0)}/${mustAll}`);
  if (niceAll > 0) parts.push(`желательные ${closedCount(match.niceMatched.length, match.niceClose?.length ?? 0)}/${niceAll}`);
  return parts.join(' · ');
}

export type MatchLevel = 'hi' | 'md' | 'lo';

/** Уровень для цвета эквалайзера: от 80 — высокий, 60–79 — средний, ниже — низкий. */
export const matchLevel = (score: number): MatchLevel => (score >= 80 ? 'hi' : score >= 60 ? 'md' : 'lo');

/** Сколько из 10 полос эквалайзера горит. */
export const matchBars = (score: number): number => Math.min(10, Math.max(0, Math.round(score / 10)));
