import { useState } from 'react';
import { haptic } from '../../max/bridge';
import { CheckIcon } from './icons';

/** Текст ошибки у поля. */
export function FieldError({ id, msg }: { id?: string; msg?: string }) {
  if (!msg) return null;
  return (
    <p id={id} className="pf-err" role="alert">
      {msg}
    </p>
  );
}

/** «черновик сохранён» в шапке формы. */
export function SavedMark() {
  return (
    <span className="lbl pf-saved">
      <CheckIcon />
      черновик сохранён
    </span>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** Строка пояснения под вариантом (только крупные варианты на телефоне). */
  hint?: string;
}

interface ChoiceProps<T extends string> {
  label: string;
  value: T | null;
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
  /** Десктоп: сегментный переключатель вместо крупных вариантов. */
  compact: boolean;
  invalid?: boolean;
  describedBy?: string;
}

/** Выбор одного варианта: крупные карточки на телефоне, сегменты на десктопе. */
export function Choice<T extends string>({ label, value, options, onChange, compact, invalid, describedBy }: ChoiceProps<T>) {
  const pick = (v: T) => {
    haptic.selection();
    onChange(v);
  };
  return (
    <div
      className={compact ? 'seg' : 'pf-opts'}
      role="radiogroup"
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={compact ? (on ? 'on' : undefined) : `pf-opt${on ? ' on' : ''}`}
            onClick={() => pick(o.value)}
          >
            {compact ? (
              o.label
            ) : (
              <>
                <span className="pf-radio" aria-hidden="true">
                  {on && <CheckIcon className="ic xs" />}
                </span>
                <span className="col grow">
                  <span className="pf-opt-t">{o.label}</span>
                  {o.hint && <span className="lbl">{o.hint}</span>}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Текст, который сменяется значением (тип, формат, сроки, число откликов): старый гаснет, новый проявляется на его месте.
 * Первый показ — без анимации.
 */
export function Swap({ text }: { text: string }) {
  const [s, setS] = useState({ cur: text, prev: null as string | null, n: 0 });
  if (s.cur !== text) setS({ cur: text, prev: s.cur, n: s.n + 1 });
  if (s.prev === null) return <>{s.cur}</>;
  return (
    <span className="pf-swap">
      <span key={`o${s.n}`} className="pf-fade-out" aria-hidden="true" onAnimationEnd={() => setS((x) => ({ ...x, prev: null }))}>
        {s.prev}
      </span>
      <span key={`i${s.n}`} className="pf-fade-in">
        {s.cur}
      </span>
    </span>
  );
}
