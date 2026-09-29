// Содержимое восьми шагов формы места. Одни и те же блоки идут и пошагово (телефон), и одной страницей (десктоп).
import { useLayoutEffect, useRef, useState } from 'react';
import type { InternshipType, SkillCode, Tag, WorkFormat } from '../../api/types';
import { haptic } from '../../max/bridge';
import { tagColor } from '../student/place';
import { cityOf, LIMITS, slotsText, type Dict, type Draft, type Errors } from './draft';
import { CheckIcon, CrossIcon, MinusIcon, PlusIcon, SearchIcon } from './icons';
import { Choice, FieldError, type ChoiceOption } from './ui';

export interface StepProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  errors: Errors;
  dict: Dict;
  /** Десктоп: компактные переключатели, без подсказок-примеров. */
  compact: boolean;
}

// ---------- 1. Задача и теги ----------

/**
 * Задача — одна строка по смыслу, но длинная видна целиком: поле переносит слова и растёт по высоте.
 * Перевод строки не вводится: Enter — как в однострочном поле (на телефоне — «Дальше»), вставка — через пробел.
 */
function TitleField({ className, value, ariaLabel, invalid, onChange }: {
  className: string;
  value: string;
  ariaLabel?: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Высота по содержимому: при вводе и при смене ширины окна (поворот, десктоп)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const grow = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    };
    grow();
    window.addEventListener('resize', grow);
    return () => window.removeEventListener('resize', grow);
  }, [value]);

  return (
    <textarea
      ref={ref}
      id="pf-title"
      className={className}
      rows={1}
      value={value}
      maxLength={LIMITS.title}
      placeholder="Например, настроить карточки на Wildberries"
      autoComplete="off"
      enterKeyHint="next"
      aria-label={ariaLabel}
      aria-invalid={invalid}
      aria-describedby="pf-title-err"
      onChange={(e) => onChange(e.target.value.replace(/\s*[\r\n]+\s*/g, ' '))}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
        e.preventDefault();
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

export function TaskStep({ draft, update, errors, dict, compact }: StepProps) {
  const full = draft.tags.length >= LIMITS.tags;

  // Тег подставляет навыки: в обязательные, если их ещё нет, иначе — в желательные. Дальше работодатель правит сам.
  const toggleTag = (tag: Tag) => {
    haptic.selection();
    if (draft.tags.includes(tag.code)) {
      update({ tags: draft.tags.filter((c) => c !== tag.code) });
      return;
    }
    const skills = tag.skills.filter((s) => dict.skillName.has(s));
    let { requiredSkills, niceSkills } = draft;
    if (requiredSkills.length === 0) {
      requiredSkills = skills.slice(0, LIMITS.skills);
      niceSkills = niceSkills.filter((s) => !requiredSkills.includes(s));
    } else {
      const add = skills.filter((s) => !requiredSkills.includes(s) && !niceSkills.includes(s));
      niceSkills = [...niceSkills, ...add].slice(0, LIMITS.skills);
    }
    update({ tags: [...draft.tags, tag.code], requiredSkills, niceSkills });
  };

  return (
    <>
      <div className="pf-group">
        {!compact && (
          <label htmlFor="pf-title" className="lbl">
            Задача для студента, коротко
          </label>
        )}
        <TitleField
          className={compact ? 'pf-line sm' : 'pf-line'}
          value={draft.title}
          ariaLabel={compact ? 'Задача для студента' : undefined}
          invalid={Boolean(errors.title)}
          onChange={(title) => update({ title })}
        />
        <div className="pf-under">
          <FieldError id="pf-title-err" msg={errors.title} />
          <span className="lbl num">
            {draft.title.length} из {LIMITS.title}
          </span>
        </div>
      </div>

      <div className="pf-group">
        <span className="lbl" id="pf-tags-l">
          {compact ? 'Направление, до трёх — подставит навыки' : 'Направление, до трёх — по нему подставим навыки на шаге 3'}
        </span>
        <div className="chips" role="group" aria-labelledby="pf-tags-l">
          {dict.tags.map((tag) => {
            const on = draft.tags.includes(tag.code);
            return (
              <button
                key={tag.code}
                type="button"
                className={on ? 'chip on' : 'chip'}
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => toggleTag(tag)}
              >
                <i className="dot" style={{ background: tagColor(tag.code) }} aria-hidden="true" />
                {tag.name}
              </button>
            );
          })}
        </div>
        <FieldError msg={errors.tags} />
      </div>

      {!compact && (
        <div className="surf pf-hint">
          <span className="pf-hint-t">Не знаете, как сформулировать?</span>
          <span className="lbl">«Навести порядок в 1С», «Вести соцсети кофейни», «Собрать отчёт по продажам за квартал»</span>
        </div>
      )}
    </>
  );
}

// ---------- 2. Тип места ----------

const TYPE_OPTIONS: ChoiceOption<InternshipType>[] = [
  { value: 'practice', label: 'Практика', hint: 'Засчитывается студенту в вузе, оформляется договором с вузом' },
  { value: 'internship', label: 'Стажировка', hint: 'Несколько месяцев с наставником, потом можно взять в штат' },
  { value: 'part_time', label: 'Подработка', hint: 'Неполный день или разовые задачи' },
];

export function TypeStep({ draft, update, errors, compact }: StepProps) {
  return (
    <div className="pf-group">
      <Choice
        label="Тип места"
        value={draft.type}
        options={TYPE_OPTIONS}
        onChange={(type) => update({ type })}
        compact={compact}
        invalid={Boolean(errors.type)}
        describedBy="pf-type-err"
      />
      <FieldError id="pf-type-err" msg={errors.type} />
      <p className="lbl m0 pf-terms">
        <span>Практика — по договору с вузом, оплата по желанию.</span>
        <span>Стажировка и подработка — по трудовому договору, с оплатой не ниже МРОТ при полной занятости.</span>
      </p>
    </div>
  );
}

// ---------- 3. Навыки ----------

type ListKind = 'required' | 'nice';

export function SkillsStep({ draft, update, errors, dict, compact }: StepProps) {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<ListKind>(draft.requiredSkills.length ? 'nice' : 'required');
  const [note, setNote] = useState<string | null>(null);
  const name = (code: SkillCode) => dict.skillName.get(code) ?? code;

  const listOf = (kind: ListKind) => (kind === 'required' ? draft.requiredSkills : draft.niceSkills);
  const patchOf = (kind: ListKind, list: SkillCode[], other: SkillCode[]): Partial<Draft> =>
    kind === 'required' ? { requiredSkills: list, niceSkills: other } : { niceSkills: list, requiredSkills: other };

  /** Навык — в список kind; уже там — убрать. Навык не может быть и обязательным, и желательным. */
  const put = (code: SkillCode, kind: ListKind) => {
    const otherKind: ListKind = kind === 'required' ? 'nice' : 'required';
    const list = listOf(kind);
    const other = listOf(otherKind);
    haptic.selection();
    if (list.includes(code)) {
      update(patchOf(kind, list.filter((c) => c !== code), other));
      setNote(null);
      return;
    }
    if (list.length >= LIMITS.skills) {
      setNote(`В списке уже ${LIMITS.skills} навыков — сначала уберите лишний`);
      return;
    }
    update(patchOf(kind, [...list, code], other.filter((c) => c !== code)));
    setNote(null);
  };

  const q = query.trim().toLowerCase();
  const groups = dict.groups
    .map((g) => ({
      name: g.name,
      skills: q ? g.skills.filter((s) => s.name.toLowerCase().includes(q) || s.code.includes(q)) : g.skills,
    }))
    .filter((g) => g.skills.length > 0);

  const addFirstMatch = () => {
    const first = groups.flatMap((g) => g.skills).find((s) => !listOf(target).includes(s.code));
    if (q && first) {
      put(first.code, target);
      setQuery('');
    }
  };

  const tagNames = draft.tags.map((c) => dict.tags.find((t) => t.code === c)?.name ?? c);

  const renderList = (kind: ListKind) => {
    const list = listOf(kind);
    const other: ListKind = kind === 'required' ? 'nice' : 'required';
    if (list.length === 0) {
      return <p className="pf-empty">{kind === 'required' ? 'Пока пусто — найдите навык ниже' : 'Пока нет'}</p>;
    }
    return (
      <div className="chips">
        {list.map((code) => (
          <span key={code} className={kind === 'required' ? 'chip on pf-sk' : 'chip nice pf-sk'}>
            <button
              type="button"
              className="pf-sk-name"
              title={kind === 'required' ? 'Сделать желательным' : 'Сделать обязательным'}
              onClick={() => put(code, other)}
            >
              {name(code)}
            </button>
            <button type="button" className="pf-sk-x" aria-label={`Убрать «${name(code)}»`} onClick={() => put(code, kind)}>
              <CrossIcon />
            </button>
          </span>
        ))}
      </div>
    );
  };

  const renderSkill = (code: SkillCode, label: string) => {
    const where: ListKind | null = draft.requiredSkills.includes(code)
      ? 'required'
      : draft.niceSkills.includes(code)
        ? 'nice'
        : null;
    return (
      <button
        key={code}
        type="button"
        className={where === 'required' ? 'chip on' : where === 'nice' ? 'chip nice' : 'chip'}
        aria-pressed={where === target}
        onClick={() => put(code, target)}
      >
        {where && <CheckIcon className="ic xs" />}
        {label}
      </button>
    );
  };

  return (
    <>
      <div className="pf-group">
        <span className="pf-sect">Обязательные — выберите хотя бы один</span>
        {renderList('required')}
        <FieldError msg={errors.requiredSkills} />
      </div>
      <div className="pf-group">
        <span className="pf-sect">Желательные — будут плюсом</span>
        {renderList('nice')}
        <FieldError msg={errors.niceSkills} />
      </div>
      <p className="lbl m0">
        {tagNames.length > 0 &&
          `Подставлено по ${tagNames.length > 1 ? 'направлениям' : 'направлению'} ${tagNames.map((n) => `«${n}»`).join(', ')}. `}
        Нажмите на навык — он перейдёт в другой список. Крестик убирает навык.
      </p>

      <div className="pf-group">
        <span className="pf-sect">Добавить навык из справочника</span>
        <div className="seg pf-target" role="radiogroup" aria-label="Куда добавлять">
          {(['required', 'nice'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={target === kind}
              className={target === kind ? 'on' : undefined}
              onClick={() => setTarget(kind)}
            >
              {kind === 'required' ? 'В обязательные' : 'В желательные'}
            </button>
          ))}
        </div>
        <label className="search" htmlFor="pf-skill-q">
          <SearchIcon />
          <input
            id="pf-skill-q"
            type="search"
            value={query}
            placeholder="Найти: Excel, 1С, соцсети…"
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addFirstMatch();
              }
            }}
          />
        </label>
        <FieldError msg={note ?? undefined} />
        <div className={compact ? 'pf-picker sm' : 'pf-picker'}>
          {groups.length === 0 ? (
            <p className="pf-empty">Такого навыка нет в справочнике. Попробуйте другое слово.</p>
          ) : q ? (
            groups.map((g) => (
              <div key={g.name} className="pf-group">
                <span className="cap">{g.name}</span>
                <div className="chips">{g.skills.map((s) => renderSkill(s.code, s.name))}</div>
              </div>
            ))
          ) : (
            groups.map((g) => (
              <details key={g.name} className="pf-grp">
                <summary>
                  {g.name}
                  <span className="lbl">{g.skills.length}</span>
                </summary>
                <div className="chips">{g.skills.map((s) => renderSkill(s.code, s.name))}</div>
              </details>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ---------- 4. Формат и город ----------

const FORMAT_OPTIONS: ChoiceOption<WorkFormat>[] = [
  { value: 'office', label: 'В офисе', hint: 'Студент работает у вас' },
  { value: 'hybrid', label: 'Гибрид', hint: 'Часть дней в офисе, часть — из дома' },
  { value: 'remote', label: 'Удалённо', hint: 'Из дома, город не важен' },
];

export function PlaceStep({ draft, update, errors, dict, compact }: StepProps) {
  const remote = draft.format === 'remote';
  // На удалёнке город по желанию: подставленный из профиля не показываем, чтобы не отправить его незаметно
  const value = remote ? (draft.city ?? '') : (draft.city ?? dict.defaultCity);
  return (
    <>
      <div className="pf-group">
        <Choice
          label="Формат работы"
          value={draft.format}
          options={FORMAT_OPTIONS}
          onChange={(format) => update({ format })}
          compact={compact}
          invalid={Boolean(errors.format)}
          describedBy="pf-format-err"
        />
        <FieldError id="pf-format-err" msg={errors.format} />
      </div>
      <div className="pf-group">
        <label htmlFor="pf-city" className="lbl">
          {remote ? 'Город — по желанию' : 'Город'}
        </label>
        <input
          id="pf-city"
          className="pf-input"
          value={value}
          maxLength={LIMITS.city}
          placeholder={remote ? dict.defaultCity || 'Москва' : 'Москва'}
          autoComplete="address-level2"
          aria-invalid={Boolean(errors.city)}
          aria-describedby="pf-city-err"
          onChange={(e) => update({ city: e.target.value })}
        />
        <FieldError id="pf-city-err" msg={errors.city} />
        {!remote && draft.city === null && cityOf(draft, dict.defaultCity) && (
          <span className="lbl">Из профиля компании</span>
        )}
      </div>
    </>
  );
}

// ---------- 5. Сроки ----------

export function DatesStep({ draft, update, errors, compact }: StepProps) {
  return (
    <>
      <div className="pf-dates">
        <div className="pf-group">
          <label htmlFor="pf-from" className="lbl">
            С
          </label>
          <input
            id="pf-from"
            type="date"
            className="pf-input"
            value={draft.startsOn}
            min="2000-01-01"
            max="2100-12-31"
            aria-invalid={Boolean(errors.startsOn)}
            aria-describedby="pf-from-err"
            onChange={(e) => update({ startsOn: e.target.value })}
          />
          <FieldError id="pf-from-err" msg={errors.startsOn} />
        </div>
        <div className="pf-group">
          <label htmlFor="pf-to" className="lbl">
            По
          </label>
          <input
            id="pf-to"
            type="date"
            className="pf-input"
            value={draft.endsOn}
            min={draft.startsOn || '2000-01-01'}
            max="2100-12-31"
            aria-invalid={Boolean(errors.endsOn)}
            aria-describedby="pf-to-err"
            onChange={(e) => update({ endsOn: e.target.value })}
          />
          <FieldError id="pf-to-err" msg={errors.endsOn} />
        </div>
      </div>
      {!compact && <p className="lbl m0">Сроки студент видит на карточке места.</p>}
    </>
  );
}

// ---------- 6. Оплата ----------

type PaidChoice = 'yes' | 'no';

export function PayStep({ draft, update, errors, compact }: StepProps) {
  const options: ChoiceOption<PaidChoice>[] = [
    { value: 'yes', label: compact ? 'Оплачивается' : 'Да, оплачивается' },
    { value: 'no', label: compact ? 'Без оплаты' : 'Нет, без оплаты' },
  ];
  const value: PaidChoice | null = draft.paid === null ? null : draft.paid ? 'yes' : 'no';
  return (
    <>
      <div className="pf-group">
        <Choice
          label="Оплата"
          value={value}
          options={options}
          onChange={(v) => update({ paid: v === 'yes' })}
          compact={compact}
          invalid={Boolean(errors.paid)}
          describedBy="pf-paid-err"
        />
        <FieldError id="pf-paid-err" msg={errors.paid} />
      </div>
      {draft.paid && (
        <div className="pf-group">
          <label htmlFor="pf-salary" className="lbl">
            Сумма в месяц, ₽ — по желанию
          </label>
          <input
            id="pf-salary"
            className="pf-input num"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Например, 25 000"
            value={draft.salary ? Number(draft.salary).toLocaleString('ru-RU') : ''}
            aria-invalid={Boolean(errors.salary)}
            aria-describedby="pf-salary-err pf-salary-hint"
            onChange={(e) => update({ salary: e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 8) })}
          />
          <FieldError id="pf-salary-err" msg={errors.salary} />
          <span id="pf-salary-hint" className="lbl">
            До вычета НДФЛ. По трудовому договору компания платит сверху страховые взносы.
          </span>
        </div>
      )}
      {draft.paid === false && !compact && (
        <p className="lbl m0">Практика без оплаты — нормально: для студента важнее задачи и документы для вуза.</p>
      )}
    </>
  );
}

// ---------- 7. Число мест ----------

export function SlotsStep({ draft, update, errors }: StepProps) {
  const set = (n: number) => {
    haptic.selection();
    update({ slots: Math.min(Math.max(n, 1), LIMITS.slotsMax) });
  };
  return (
    <div className="pf-group">
      <div className="pf-stepper" role="group" aria-label="Число мест">
        <button type="button" className="ibtn" aria-label="Меньше" disabled={draft.slots <= 1} onClick={() => set(draft.slots - 1)}>
          <MinusIcon />
        </button>
        <output className="pf-count num" aria-live="polite">
          {draft.slots}
        </output>
        <button
          type="button"
          className="ibtn"
          aria-label="Больше"
          disabled={draft.slots >= LIMITS.slotsMax}
          onClick={() => set(draft.slots + 1)}
        >
          <PlusIcon />
        </button>
      </div>
      <span className="lbl">{slotsText(draft.slots)} — столько студентов вы готовы взять</span>
      <FieldError msg={errors.slots} />
    </div>
  );
}

// ---------- 8. Описание ----------

export function DescriptionStep({ draft, update, errors, compact }: StepProps) {
  return (
    <div className="pf-group">
      <textarea
        id="pf-desc"
        className="pf-area"
        rows={compact ? 3 : 7}
        maxLength={LIMITS.description}
        value={draft.description}
        placeholder="Например: заполнить 40 карточек товаров — названия, характеристики, фото. Около 10 часов в неделю, можно совмещать с учёбой. Наставник — руководитель, созвон по понедельникам."
        aria-label="Описание — по желанию"
        aria-invalid={Boolean(errors.description)}
        aria-describedby="pf-desc-err"
        onChange={(e) => update({ description: e.target.value })}
      />
      <div className="pf-under">
        <FieldError id="pf-desc-err" msg={errors.description} />
        <span className="lbl num">
          {draft.description.length} из {LIMITS.description}
        </span>
      </div>
    </div>
  );
}
