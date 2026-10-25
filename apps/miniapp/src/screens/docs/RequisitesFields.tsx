// Поля реквизитов группами (компания, подписант, ответственный) — в профиле компании и на экране документов.
import { TextField } from '../../components/TextField';
import { REQUISITE_GROUPS, REQUISITE_MAX, requisiteId, type RequisiteName, type RequisitesForm } from './requisites';
import './requisites.css';

interface Props {
  form: RequisitesForm;
  errors: Record<string, string>;
  onChange: (name: RequisiteName, value: string) => void;
}

export function RequisitesFields({ form, errors, onChange }: Props) {
  return (
    <>
      {REQUISITE_GROUPS.map((g) => (
        <fieldset key={g.title} className="req-group">
          <legend className="cap req-cap">{g.title}</legend>
          <div className="surf">
            {g.fields.map((f) => (
              <TextField
                key={f.name}
                id={requisiteId(f.name)}
                label={f.label}
                value={form[f.name]}
                error={errors[f.name]}
                onChange={(v) => onChange(f.name, v)}
                maxLength={REQUISITE_MAX}
                placeholder={f.placeholder}
                inputMode={f.inputMode}
                type={f.inputMode === 'email' ? 'email' : f.inputMode === 'tel' ? 'tel' : 'text'}
                autoComplete={f.autoComplete ?? 'off'}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </>
  );
}
