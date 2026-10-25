// Поле формы с подписью и ошибкой под ним (профиль компании, реквизиты для документов практики). Стили — pf-field.
import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

export function TextField({ id, label, value, error, onChange, ...rest }: TextFieldProps) {
  return (
    <div className={error ? 'pf-field bad' : 'pf-field'}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      {error && (
        <span id={`${id}-err`} className="pf-err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
