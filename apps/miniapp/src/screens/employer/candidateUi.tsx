// Общие куски кандидата: аватар, эквалайзер совпадения, навыки, «Скопировать».
import { useEffect, useState } from 'react';
import type { Candidate, Match } from '../../api/types';
import { matchBars, matchLevel, skillName, type SkillNames } from '../../app/matchText';
import { haptic } from '../../max/bridge';
import { avatarClass, copyText, initial } from './candidate';
import { CheckIcon, CopyIcon } from './icons';

export function Avatar({ c, size = 42 }: { c: Pick<Candidate, 'studentId' | 'firstName'>; size?: number }) {
  return (
    <span
      className={`ava ${avatarClass(c.studentId)}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {initial(c)}
    </span>
  );
}

/** Высоты полос — как в макете: неровный ряд, как эквалайзер. */
const HEIGHTS = [0.43, 0.71, 1, 0.57, 0.86, 1, 0.64, 0.93, 0.5, 0.79];

interface EqProps {
  score: number;
  /** Высота столбика в px: 28 — на карточке, 16 — в списке. */
  height?: number;
  /** На светлой поверхности (не на тёмной карточке). */
  onSurf?: boolean;
}

/** 10 полос, горят round(score/10); цвет — по уровню совпадения. */
export function Eq({ score, height = 16, onSurf = true }: EqProps) {
  const on = matchBars(score);
  const mini = height < 24;
  return (
    <span
      className={`eq ${matchLevel(score)}${mini ? ' mini' : ''}${onSurf ? ' on-surf' : ''}`}
      style={{ height }}
      aria-hidden="true"
    >
      {HEIGHTS.map((h, i) => (
        <i key={i} className={i < on ? 'on' : undefined} style={{ height: Math.round(h * height) }} />
      ))}
    </span>
  );
}

/** Навыки места у кандидата: совпавшие — с галочкой, недостающие — пунктиром. Сначала обязательные. */
export function MatchSkills({ match, names, max }: { match: Match; names: SkillNames; max?: number }) {
  const all = [
    ...match.mustMatched.map((code) => ({ code, ok: true })),
    ...match.niceMatched.map((code) => ({ code, ok: true })),
    ...match.mustMissing.map((code) => ({ code, ok: false })),
    ...match.niceMissing.map((code) => ({ code, ok: false })),
  ];
  if (all.length === 0) return null;
  const shown = max ? all.slice(0, max) : all;
  const more = all.length - shown.length;
  return (
    <ul className="skills cd-skills" aria-label="Навыки места">
      {shown.map((s) => (
        <li key={s.code} className={s.ok ? 'sk ok' : 'sk no'}>
          {s.ok && <CheckIcon className="ic" />}
          {skillName(names, s.code)}
          <span className="sr-only">{s.ok ? ' — есть' : ' — нет'}</span>
        </li>
      ))}
      {more > 0 && <li className="sk no">+{more}</li>}
    </ul>
  );
}

/** «Скопировать»: подтверждение на кнопке на 2 секунды. */
export function CopyButton({ text, label = 'Скопировать', className = 'btn sec sm' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (done === null) return;
    const t = window.setTimeout(() => setDone(null), 2000);
    return () => window.clearTimeout(t);
  }, [done]);

  const copy = async () => {
    const ok = await copyText(text);
    if (ok) haptic.notify('success');
    setDone(ok);
  };

  return (
    <button type="button" className={className} onClick={() => void copy()} aria-live="polite">
      {done === true ? <CheckIcon /> : <CopyIcon />}
      {done === true ? 'Скопировано' : done === false ? 'Не вышло — выделите номер' : label}
    </button>
  );
}
