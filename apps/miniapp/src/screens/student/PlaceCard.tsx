import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Internship } from '../../api/types';
import { companyInitial, coverOf, nameOf, placeFacts, placeWhere, typeChip, type SkillNames } from './place';
import { Cover, Eq, Icon, Pct } from './ui';
import { DemoBadge } from '../../components/DemoBadge';
import { FitLabel } from '../../components/FitLabel';

/** Сколько навыков помещается на карточке, остальное — «+N». */
const CARD_SKILLS = 6;

/**
 * Вид карточки на шаге ужатия. tight — степень ужатия текста (классы t1–t3 в student.css):
 * 1 — заголовок в две строки; 2 — ещё условия (оплата, сроки, места) в одну строку; 3 — условий нет,
 * подсказка своего места в две строки (всё это есть в «Подробнее»).
 */
interface Squeeze {
  skills: number;
  tight: 0 | 1 | 2 | 3;
}

/**
 * Шаги ужатия, если текст не помещается в карточку (узкий или невысокий экран, своё место с подсказкой):
 * сначала меньше навыков — остальные в «+N», потом ужатие текста. Процент и хотя бы один навык с «+N»
 * остаются всегда: процент показываем вместе с расшифровкой.
 */
function squeezeSteps(total: number): Squeeze[] {
  const most = Math.min(CARD_SKILLS, total);
  const few = Math.min(2, most);
  const steps: Squeeze[] = [];
  for (let n = most; n >= few; n--) steps.push({ skills: n, tight: 0 });
  steps.push({ skills: few, tight: 1 }, { skills: few, tight: 2 });
  steps.push({ skills: Math.min(1, most), tight: 2 }, { skills: Math.min(1, most), tight: 3 });
  return steps;
}

/**
 * Номер шага ужатия. После отрисовки, до кадра на экране, меряем: текст вылез за низ карточки — берём следующий шаг,
 * и так до подходящего. Сменилось содержимое (content), размер карточки или догрузились шрифты — подбор заново,
 * с полного вида.
 */
function useSqueeze(
  face: RefObject<HTMLDivElement | null>,
  info: RefObject<HTMLDivElement | null>,
  count: number,
  content: string,
): number {
  // n — счётчик перезапусков: новый объект состояния, даже если шаг и так нулевой
  const [fit, setFit] = useState({ step: 0, content, n: 0 });
  if (fit.content !== content) setFit({ step: 0, content, n: fit.n + 1 });
  const step = Math.min(fit.step, count - 1);
  const fittedSize = useRef('');

  useLayoutEffect(() => {
    const f = face.current;
    const i = info.current;
    if (!f || !i) return;
    fittedSize.current = `${f.clientWidth}x${f.clientHeight}`;
    if (i.offsetTop + i.offsetHeight > f.clientHeight && step < count - 1) {
      // Замер раскладки до отрисовки и повторная отрисовка — то, для чего нужен useLayoutEffect
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFit((prev) => ({ ...prev, step: step + 1 }));
    }
  }, [face, info, step, count, fit.n]);

  useEffect(() => {
    const f = face.current;
    if (!f) return;
    const restart = () => setFit((prev) => ({ ...prev, step: 0, n: prev.n + 1 }));
    const observer = new ResizeObserver(() => {
      if (`${f.clientWidth}x${f.clientHeight}` !== fittedSize.current) restart();
    });
    observer.observe(f);
    document.fonts.addEventListener('loadingdone', restart);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', restart);
    };
  }, [face]);

  return step;
}

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
  const face = useRef<HTMLDivElement>(null);
  const info = useRef<HTMLDivElement>(null);
  const steps = squeezeSteps(skills.length);
  // Содержимое карточки меняется, только если пришли другие названия навыков
  const view = steps[useSqueeze(face, info, steps.length, `${place.id}:${names.size}`)];
  return (
    <>
      <Cover cls={cover.cls} />
      <div className="shade" />
      {/* Плашки, надпись обложки и текст — одной колонкой: надпись занимает только место между плашками и текстом
          и уменьшается под него, поэтому не наезжает на заголовок при любой длине текста и любом числе плашек. */}
      <div ref={face} className={view.tight ? `card-face t${view.tight}` : 'card-face'}>
        <div className="topchips">
          <span className="row pc-chips">
            <span className="gchip">{typeChip(place)}</span>
            {place.isOwner && <span className="gchip own">Ваше место</span>}
          </span>
          <DemoBadge isDemo={place.isDemo} onCover />
        </div>
        <FitLabel className="card-cv" label={cover.label} />
        <div ref={info} className="info">
          <div className="col" style={{ gap: 8 }}>
            <h2 className="title pc-title">{place.title}</h2>
            <div className="row">
              <span className="logo">{companyInitial(place.company.name)}</span>
              <span className="pc-where">
                {place.company.name} · {placeWhere(place)}
              </span>
            </div>
          </div>
          {place.isOwner && (
            <p className="m0 pc-own">Откликнитесь, чтобы проверить путь студента: потом пригласите себя в роли компании</p>
          )}
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
              {skills.slice(0, view.skills).map(([code, ok]) => (
                <span key={code} className={`sk ${ok ? 'ok' : 'no'}`}>
                  {ok && <Icon name="check" />}
                  <span className="pc-sk-name">{nameOf(names, code)}</span>
                </span>
              ))}
              {skills.length > view.skills && <span className="sk no">+{skills.length - view.skills}</span>}
            </div>
          )}
          {facts && <div className="facts pc-facts">{facts}</div>}
        </div>
      </div>
    </>
  );
}
