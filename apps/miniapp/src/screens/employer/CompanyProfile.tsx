// Профиль компании: три обязательных поля (docs/api.md, «Профиль компании»). Первый раз — потом сразу форма места.
// Ниже — необязательные реквизиты для документов практики (F-16), свёрнуты, пока не заполнены.
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { api, ApiError } from '../../api/client';
import type { EmployerProfile } from '../../api/types';
import { useLoad } from '../../api/useLoad';
import { useMe } from '../../app/me';
import { ErrorState } from '../../components/ErrorState';
import { flash } from '../../components/flashMessage';
import { Skeleton } from '../../components/Skeleton';
import { TextField } from '../../components/TextField';
import { haptic, insideMax, requestContact, type MaxContact } from '../../max/bridge';
import {
  checkRequisites,
  REQUISITE_FIELDS,
  requisiteId,
  requisitesBody,
  requisitesFilled,
  requisitesForm,
  type RequisiteName,
} from '../docs/requisites';
import { RequisitesFields } from '../docs/RequisitesFields';
import type { Errors } from './draft';
import { CheckIcon, ChevronIcon, DocIcon, PhoneIcon } from './icons';
import './employer.css';

/** Экран согласия и телефона — задача #14; после него пользователь вернётся сюда. */
const CONSENT_PATH = '/consent?next=/employer/profile';

const LIMIT = { companyName: 200, city: 100, contactName: 200 } as const;
type FieldName = keyof typeof LIMIT;
/** id полей в порядке на экране. */
const FIELD_ID: Record<FieldName, string> = { companyName: 'co-name', city: 'co-city', contactName: 'co-contact' };

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
      <main className="screen emp">
        <Skeleton lines={3} height={56} />
      </main>
    );
  }
  if (state.status === 'error') {
    return (
      <main className="screen emp">
        <ErrorState error={state.error} onRetry={retry} />
      </main>
    );
  }
  return <CompanyForm initial={state.data} />;
}

/**
 * Номер компании — как строка «Поделиться номером» в профиле студента: тот же requestContact, номер с подписью MAX
 * уходит в POST /api/me/phone. Без перехода на экран онбординга: несохранённые поля формы не теряются.
 * Номер уже есть — показываем это. Кнопку не блокируем: окно MAX можно закрыть без ответа, и запрос повиснет.
 */
function PhoneRow() {
  const { me, setMe } = useMe();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const share = async () => {
    setAsking(true);
    setNote(null);
    let contact: MaxContact;
    try {
      contact = await requestContact();
    } catch {
      // Отказ в окне MAX или приложение открыто не в MAX — номер не обязателен
      setAsking(false);
      setNote(insideMax ? 'Номер не получен. Поделиться им можно в любой момент.' : 'Поделиться номером можно в приложении MAX.');
      return;
    }
    try {
      setMe(await api.phone(contact));
      haptic.notify('success');
    } catch (err) {
      haptic.notify('error');
      setNote(err instanceof ApiError ? err.message : 'Не получилось сохранить номер. Повторите попытку.');
    } finally {
      setAsking(false);
    }
  };

  if (me.hasPhone) {
    return (
      <div className="surf">
        <div className="li co-phone">
          <PhoneIcon />
          <span className="col grow">
            <span>Номер телефона добавлен</span>
            <span className="lbl">Студент увидит его только после приглашения</span>
          </span>
          <span className="co-phone-ok" aria-hidden="true">
            <CheckIcon className="ic xs" />
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="surf">
      <button type="button" className="li co-phone" onClick={() => void share()}>
        <PhoneIcon />
        <span className="col grow">
          <span>{asking ? 'Ждём номер от MAX…' : 'Поделиться номером'}</span>
          <span className="lbl">Студент увидит его только после приглашения. Без номера он не сможет вам позвонить.</span>
        </span>
        <ChevronIcon />
      </button>
      {note && (
        <p className="lbl co-phone-note" role="status">
          {note}
        </p>
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
  // Реквизиты показываем, когда сервер их знает (F-16, #142): иначе PUT молча их отбросит
  const reqSupported = initial !== null && 'inn' in initial;
  const [req, setReq] = useState(() => requisitesForm(initial));
  // Реквизиты нужны только для практики: свёрнуты, пока ни одного поля нет
  const [reqOpen, setReqOpen] = useState(() => requisitesFilled(requisitesForm(initial)).done > 0);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Чётность переключает анимацию покачивания полей с ошибкой, чтобы она повторялась при каждой попытке
  const [attempt, setAttempt] = useState(0);

  const clearError = (name: string) => {
    if (errors[name]) setErrors(Object.fromEntries(Object.entries(errors).filter(([k]) => k !== name)));
    if (formError) setFormError(null);
  };
  const set = (name: FieldName) => (value: string) => {
    setForm({ ...form, [name]: value });
    clearError(name);
  };
  const setRequisite = (name: RequisiteName, value: string) => {
    setReq({ ...req, [name]: value });
    clearError(name);
  };
  const filled = requisitesFilled(req);

  // Курсор — в первое поле с ошибкой: с клавиатуры и экранным диктором не надо искать, что не так.
  // Ошибка в реквизитах — раскрываем их; поле появится после отрисовки
  const focusFirst = (found: Errors) => {
    const main = (Object.keys(FIELD_ID) as FieldName[]).find((k) => k in found);
    if (main) {
      document.getElementById(FIELD_ID[main])?.focus();
      return;
    }
    const field = REQUISITE_FIELDS.find((f) => f.name in found);
    if (!field) return;
    setReqOpen(true);
    requestAnimationFrame(() => document.getElementById(requisiteId(field.name))?.focus());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const body: EmployerProfile = {
      companyName: form.companyName.trim(),
      city: form.city.trim(),
      contactName: form.contactName.trim(),
      ...(reqSupported ? requisitesBody(req) : {}),
    };
    const found: Errors = checkRequisites(req);
    if (!body.companyName) found.companyName = 'Укажите название компании';
    if (!body.city) found.city = 'Укажите город';
    if (!body.contactName) found.contactName = 'Укажите, к кому обращаться студенту';
    if (Object.keys(found).length) {
      setErrors(found);
      setAttempt((n) => n + 1);
      haptic.notify('error');
      focusFirst(found);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await api.saveEmployerProfile(body);
      haptic.notify('success');
      setMe({ ...me, roles: { ...me.roles, employer: true } });
      if (isNew) navigate('/employer/new', { replace: true });
      else {
        flash('Профиль компании сохранён');
        if (historyIndex() > 0) navigate(-1);
        else navigate('/employer', { replace: true });
      }
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
      if (REQUISITE_FIELDS.some((f) => f.name in apiErr.fields)) setReqOpen(true);
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
            id={FIELD_ID.companyName}
            label="Название компании"
            value={form.companyName}
            error={errors.companyName}
            onChange={set('companyName')}
            maxLength={LIMIT.companyName}
            placeholder="Например, ООО «Вектор»"
            autoComplete="organization"
          />
          <TextField
            id={FIELD_ID.city}
            label="Город"
            value={form.city}
            error={errors.city}
            onChange={set('city')}
            maxLength={LIMIT.city}
            placeholder="Москва"
            autoComplete="address-level2"
          />
          <TextField
            id={FIELD_ID.contactName}
            label="Контактное лицо"
            value={form.contactName}
            error={errors.contactName}
            onChange={set('contactName')}
            maxLength={LIMIT.contactName}
            placeholder="Как к вам обращаться"
            autoComplete="name"
          />
        </div>
        <PhoneRow />
        <p className="lbl m0">Имя контактного лица и ваш номер, если вы им поделились, студент получит только после вашего приглашения.</p>
        {reqSupported && (
          <section className="req" aria-label="Реквизиты для документов практики">
            <div className="surf">
              <button
                type="button"
                className="li req-toggle"
                aria-expanded={reqOpen}
                aria-controls={reqOpen ? 'req-body' : undefined}
                onClick={() => {
                  haptic.selection();
                  setReqOpen(!reqOpen);
                }}
              >
                <span className="ico g req-ico" aria-hidden="true">
                  <DocIcon />
                </span>
                <span className="col grow">
                  <span className="req-t">Реквизиты для документов практики</span>
                  <span className="lbl">
                    {filled.done === filled.total
                      ? 'Заполнены — договор и письмо соберутся целиком'
                      : filled.done === 0
                        ? 'Нужны для договора с вузом и письма о согласии. Можно заполнить позже'
                        : `Заполнено ${filled.done} из ${filled.total}`}
                  </span>
                </span>
                <ChevronIcon />
              </button>
            </div>
            {reqOpen && (
              <div id="req-body" className="req-body">
                <p className="lbl m0">
                  Подставим их в договор о практической подготовке и письмо о согласии, когда пригласите студента на
                  практику. Студенты их не видят, все поля необязательные.
                </p>
                <RequisitesFields form={req} errors={errors} onChange={setRequisite} />
              </div>
            )}
          </section>
        )}
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
