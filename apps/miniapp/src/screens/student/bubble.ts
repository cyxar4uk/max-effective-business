// Размер пузыря навыка в анкете (.bub в app.css): растёт с длиной названия, как в макете, и не меньше самого
// длинного слова — слова в пузыре не рвутся и не обрезаются. Слово длиннее самого крупного пузыря — шрифт мельче.
import { useEffect, useMemo, useState } from 'react';
import type { Skills } from '../../api/types';

/** Как у .bub в app.css: шрифт 600 13px Onest, поля 10 px. */
const FONT = 13;
const FONT_MIN = 11;
const FONT_FAMILY = 'Onest, system-ui, sans-serif';
const PAD = 10;
/** Запас к ширине слова: округление и сглаживание краёв. */
const SLACK = 4;
const SIZE_MIN = 84;
/** Обычный наибольший пузырь; под длинное слово — до SIZE_MAX. */
const SIZE_BY_LENGTH = 132;
const SIZE_MAX = 136;

let ctx: CanvasRenderingContext2D | null | undefined;

/**
 * Ширина самого длинного неразрывного куска названия шрифтом пузыря, px. Перенос возможен по пробелу и после дефиса.
 * Пока шрифт не загружен (или нет canvas) — оценка по числу букв с запасом.
 */
function widestWord(name: string, fontReady: boolean): number {
  const parts = name
    .split(/\s+/)
    .flatMap((w) => w.replace(/-/g, '-\n').split('\n'))
    .filter(Boolean);
  if (fontReady && ctx === undefined) ctx = document.createElement('canvas').getContext('2d');
  const c = fontReady ? ctx : null;
  if (!c) return Math.max(0, ...parts.map((p) => p.length)) * 8.2;
  c.font = `600 ${FONT}px ${FONT_FAMILY}`;
  return Math.max(0, ...parts.map((p) => c.measureText(p).width));
}

export interface BubbleLook {
  size: number;
  /** Кегль мельче обычного, если самое длинное слово не помещается и в самый крупный пузырь. */
  fontSize?: number;
}

function bubbleLook(name: string, fontReady: boolean): BubbleLook {
  const byLength = Math.min(SIZE_BY_LENGTH, Math.max(SIZE_MIN, 70 + name.length * 1.9));
  const word = Math.ceil(widestWord(name, fontReady));
  const need = word + 2 * PAD + SLACK;
  if (need <= SIZE_MAX) return { size: Math.round(Math.max(byLength, need)) };
  const room = SIZE_MAX - 2 * PAD - SLACK;
  return { size: SIZE_MAX, fontSize: Math.max(FONT_MIN, Math.floor(((FONT * room) / word) * 10) / 10) };
}

/** Вид пузырей всех навыков справочника по коду. Пересчёт — когда загрузится шрифт пузырей. */
export function useBubbleLooks(skills: Skills): Map<string, BubbleLook> {
  const [fontReady, setFontReady] = useState(() => document.fonts.check(`600 ${FONT}px ${FONT_FAMILY}`, 'Бю'));
  useEffect(() => {
    if (fontReady) return;
    let alive = true;
    document.fonts
      .load(`600 ${FONT}px ${FONT_FAMILY}`, 'Бю')
      .then(() => {
        if (alive) setFontReady(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [fontReady]);
  return useMemo(
    () => new Map(skills.groups.flatMap((g) => g.skills.map((s) => [s.code, bubbleLook(s.name, fontReady)] as const))),
    [skills, fontReady],
  );
}
