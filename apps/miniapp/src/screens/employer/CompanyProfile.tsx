// Профиль компании: три обязательных поля (docs/api.md, «Профиль компании»). Первый раз — потом сразу форма места.
import { useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { api, ApiError } from '../../api/client';
import type { EmployerProfile } from '../../api/types';
import { useLoad } from '../../api/useLoad';
import { useMe } from '../../app/me';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { haptic } from '../../max/bridge';
import type { Errors } from './draft';
import './employer.css';

/** Экран согласия и телефона — задача #14; после него пользователь вернётся сюда. */
const CONSENT_PATH = '/consent?next=/employer/profile';

const LIMIT = { companyName: 200, city: 100, contactName: 200 } as const;
type FieldName = keyof typeof LIMIT;

const historyIndex = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0;

/** 404 — профиля ещё нет, это не ошибка: показываем пустую форму. */
const loadProfile = () =>
  api.employerProfile().catch((err: unknown) => {
    if (err instanceof ApiError && err.code === 'NOT_FOUND') return null;
    throw err;
  });

export function CompanyProfile() {
  const { me } = useMe();
  // PUT профиля требует согласия на обработку ПД
  if (me.consent === null) return <Navigate to={CONSENT_PATH} replace />;
  return <CompanyLoader />;
}

function CompanyLoader() {
  const [state, retry] = useLoad(loadProfile, []);
  if (state.status === 'loading') {
    return (
      <main className="screen">
        <Skeleton lines={3} height={56} />
      </main>
    );
  }
  if (state.status === 'error') {
    return (
      <main className="screen">
        <ErrorState error={state.error} onRetry={retry} />
      </main>
    );
  }
  return <CompanyForm initial={state.data} />;
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

function TextField({ id, label, value, error, onChange, ...rest }: TextFieldProps) {
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

function CompanyForm({ initial }: { initial: EmployerProfile | null }) {
  const { me, setMe } = useMe();
  const navigate = useNavigate();
  const isNew = initial === null;
  const [form, setForm] = useState<Record<FieldName, string>>({
    companyName: initial?.companyName ?? '',
    city: initial?.city ?? '',
    contactName: initial?.contactName ?? me.firstName ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Чётность переключает анимацию покачивания полей с ошибкой, чтобы она повторялась при каждой попытке
  const [attempt, setAttempt] = useState(0);

  const set = (name: FieldName) => (value: string) => {
    setForm({ ...form, [name]: value });
    if (errors[name]) setErrors(Object.fromEntries(Object.entries(errors).filter(([k]) => k !== name)));
    if (formError) setFormError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const body: EmployerProfile = {
      companyName: form.companyName.trim(),
      city: form.city.trim(),
      contactName: form.contactName.trim(),
    };
    const found: Errors = {};
    if (!body.companyName) found.companyName = 'Укажите название компании';
    if (!body.city) found.city = 'Укажите город';
    if (!body.contactName) found.contactName = 'Укажите, к кому обращаться студенту';
    if (Object.keys(found).length) {
      setErrors(found);
      setAttempt((n) => n + 1);
      haptic.notify('error');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await api.saveEmployerProfile(body);
      haptic.notify('success');
      setMe({ ...me, roles: { ...me.roles, employer: true } });
      if (isNew) navigate('/employer/new', { replace: true });
      else if (historyIndex() > 0) navigate(-1);
      else navigate('/employer', { replace: true });
    } catch (err) {
      const apiErr =
        err instanceof ApiError ? err : new ApiError(0, 'INTERNAL', 'Не получилось сохранить. Повторите попытку.');
      haptic.notify('error');
      if (apiErr.code === 'FORBIDDEN') {
        // Согласия нет (например, отозвано в другой вкладке) — к экрану согласия
        navigate(CONSENT_PATH, { replace: true });
        return;
      }
      setErrors(apiErr.fields);
      setFormError(apiErr.message);
      setAttempt((n) => n + 1);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="screen emp">
      <form className={attempt % 2 ? 'co sh-b' : 'co sh-a'} noValidate onSubmit={(e) => void submit(e)}>
        <header className="co-head">
          <h1 className="pf-q">Профиль компании</h1>
          <p className="lead">Три поля. Название и город студенты увидят на карточке места.</p>
        </header>
        <div className="surf">
          <TextField
            id="co-name"
            label="Название компании"
            value={form.companyName}
            error={errors.companyName}
            onChange={set('companyName')}
            maxLength={LIMIT.companyName}
            placeholder="Например, ООО «Вектор»"
            autoComplete="organization"
          />
          <TextField
            id="co-city"
            label="Город"
            value={form.city}
            error={errors.city}
            onChange={set('city')}
            maxLength={LIMIT.city}
            placeholder="Москва"
            autoComplete="address-level2"
          />
          <TextField
            id="co-contact"
            label="Контактное лицо"
            value={form.contactName}
            error={errors.contactName}
            onChange={set('contactName')}
            maxLength={LIMIT.contactName}
            placeholder="Как к вам обращаться"
            autoComplete="name"
          />
        </div>
        <p className="lbl m0">Имя контактного лица и ваш номер, если вы им поделились, студент получит только после вашего приглашения.</p>
        {formError && (
          <p key={attempt} className="pf-alert" role="alert">
            {formError}
          </p>
        )}
        <div className="pf-foot">
          <button type="submit" className="btn pri" disabled={saving}>
            {saving ? 'Сохраняем…' : isNew ? 'Сохранить и создать место' : 'Сохранить'}
          </button>
        </div>
      </form>
    </main>
  );
}
