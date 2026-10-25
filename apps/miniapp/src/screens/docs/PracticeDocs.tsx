// «Документы для практики» `/docs/:interestId` (F-16): кто что делает и .docx по отклику — у компании и у студента.
// Открывается с «Это тандем!» обеих сторон и кнопкой бота (параметр запуска `docs_<id отклика>`).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../../api/client';
import type { DocKind, EmployerProfile, PracticeDocs } from '../../api/types';
import { useLoad } from '../../api/useLoad';
import { backTo, STUDENT_TABS } from '../../app/history';
import { lastRole, type Role } from '../../app/lastRole';
import { useMe } from '../../app/me';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { downloadFile, haptic, insideMax } from '../../max/bridge';
import { parsePlaceId } from '../../app/placeParam';
import { DocIcon } from '../employer/icons';
import {
  checkRequisites,
  REQUISITE_FIELDS,
  requisiteId,
  requisitesBody,
  requisitesFilled,
  requisitesForm,
  type RequisiteName,
} from './requisites';
import { RequisitesFields } from './RequisitesFields';
import '../employer/employer.css';
import './docs.css';

/** Переход сюда с «Это тандем!»: чья сторона, пока сервер не ответил `role`. */
export interface DocsState {
  role?: Role;
  /** Куда вместо экрана, если сервер документов не знает (404): у компании — чек-лист шагов. */
  fallback?: string;
}

/** Текст шагов — из спеки F-16, без правок. */
const STEPS: { who: string; text: string; role?: Role }[] = [
  { who: 'Компания', text: 'проверяет договор и письмо о согласии, подписывает письмо и отдаёт студенту.', role: 'employer' },
  {
    who: 'Студент',
    text: 'относит договор и письмо в центр карьеры или на кафедру. Если у вуза уже есть договор с компанией, новый не нужен.',
    role: 'student',
  },
  { who: 'Вуз', text: 'подписывает договор, издаёт приказ о практике и выдаёт индивидуальное задание.' },
  { who: 'После практики', text: 'руководитель от компании пишет отзыв по шаблону.' },
];

const DOCS: { kind: DocKind; title: string; hint: string }[] = [
  { kind: 'contract', title: 'Договор о практической подготовке', hint: 'С приложениями 1 и 2. Данные компании, студента и вуза подставлены' },
  { kind: 'consent_letter', title: 'Письмо о согласии принять на практику', hint: 'Подписывает компания, в вуз относит студент' },
  { kind: 'task', title: 'Индивидуальное задание', hint: 'Пустой шаблон: заполняют с руководителем от вуза' },
  { kind: 'review', title: 'Отзыв руководителя практики', hint: 'Пустой шаблон: пишут после практики' },
];

/** Договор и письмо собираются из реквизитов компании; задание и отзыв — пустые шаблоны, доступны всегда. */
const NEEDS_REQUISITES: ReadonlySet<DocKind> = new Set(['contract', 'consent_letter']);

/** Подписанные ссылки живут ~15 минут (контракт в #143): обновляем список, пока экран открыт. */
const REFRESH_MS = 10 * 60 * 1000;
/** Старше — ссылку в MAX не отдаём: обновляем список и просим нажать ещё раз (await перед downloadFile нельзя). */
const STALE_MS = 12 * 60 * 1000;
const isStale = (fetchedAt: number) => Date.now() - fetchedAt > STALE_MS;

/** Сторона: ответ сервера, потом переход с «Это тандем!», потом единственная роль или последняя открытая. */
function sideOf(data: PracticeDocs, passed: Role | undefined, roles: Record<Role, boolean>): Role {
  if (data.role) return data.role;
  if (passed) return passed;
  if (roles.employer !== roles.student) return roles.employer ? 'employer' : 'student';
  return lastRole() ?? 'student';
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function PracticeDocsScreen() {
  const id = parsePlaceId(useParams().interestId ?? null);
  if (id === null) return <Navigate to="/" replace />;
  return <DocsLoader key={id} id={id} />;
}

function DocsLoader({ id }: { id: number }) {
  const navigate = useNavigate();
  const passedState = useLocation().state as DocsState | null;
  const passed = passedState?.role;
  const fallback = passedState?.fallback;
  const { me } = useMe();
  const [state, retry] = useLoad(() => api.practiceDocs(id), [id]);

  if (state.status === 'loading') {
    return (
      <main className="screen pdc">
        <div className="pdc-wait">
          <Skeleton lines={1} height={72} />
          <Skeleton lines={4} height={64} />
        </div>
      </main>
    );
  }
  if (state.status === 'error') {
    // Сервер без документов (например, до выкатки #142) — у компании остаётся чек-лист шагов
    if (state.error.code === 'NOT_FOUND' && fallback) return <Navigate to={fallback} replace />;
    return (
      <main className="screen pdc">
        {state.error.code === 'NOT_FOUND' ? (
          <EmptyState
            title="Документы не найдены"
            text="Документы есть только у приглашения на практику. Возможно, место закрыли или открыли чужую ссылку. Если приглашение только что пришло — загляните чуть позже."
            actionLabel="На главный"
            onAction={() => backTo(navigate, '/')}
          />
        ) : (
          <ErrorState error={state.error} onRetry={retry} />
        )}
      </main>
    );
  }
  return <Docs id={id} initial={state.data} side={sideOf(state.data, passed, me.roles)} />;
}

interface Note {
  kind: DocKind;
  ok: boolean;
  text: string;
}

function Docs({ id, initial, side }: { id: number; initial: PracticeDocs; side: Role }) {
  const navigate = useNavigate();
  const [docs, setDocs] = useState(initial);
  // Когда получены ссылки: читаем в обработчике нажатия, не при отрисовке
  const fetchedAt = useRef(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<DocKind | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const employer = side === 'employer';
  const ready = docs.requisitesReady;

  const refresh = (): Promise<PracticeDocs | null> =>
    api.practiceDocs(id).then(
      (next) => {
        fetchedAt.current = Date.now();
        setDocs(next);
        return next;
      },
      // Старые ссылки ещё могут работать; не вышло скачать — ошибка будет у кнопки
      () => null,
    );

  // Таймеры в фоне webview засыпают: кроме интервала, обновляем ссылки при возврате в приложение
  useEffect(() => {
    fetchedAt.current = Date.now();
    const t = window.setInterval(() => void refresh(), REFRESH_MS);
    const onShow = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onShow);
    };
    // refresh зависит только от id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const sideRef = useRef<HTMLDivElement>(null);
  const openRequisites = () => {
    haptic.selection();
    setSaved(null);
    setEditing(true);
  };

  // Форма и итог сохранения — в правой колонке, на телефоне под шагами: показываем её начало. Фокус — на итог
  // сохранения (кнопка «Сохранить» исчезла, и фокус иначе упал бы на body); на форму его ставит она сама
  useEffect(() => {
    if (!editing && !saved) return;
    sideRef.current?.scrollIntoView({ block: 'start' });
    sideRef.current?.querySelector<HTMLElement>('[data-focus]')?.focus({ preventScroll: true });
  }, [editing, saved]);

  // Без await до downloadFile: MAX скачивает только по клику пользователя
  const download = (kind: DocKind, title: string) => {
    if (busy) return;
    if (NEEDS_REQUISITES.has(kind) && !ready) {
      if (employer) openRequisites();
      return;
    }
    const item = docs.items.find((x) => x.kind === kind);
    const fileName = item?.fileName || `${title}.docx`;
    setNote(null);
    if (insideMax && (!item?.url || isStale(fetchedAt.current))) {
      // Ссылки нет или она могла истечь: обновляем, скачать — следующим нажатием
      setBusy(kind);
      void refresh()
        .then((next) =>
          setNote(
            next
              ? { kind, ok: true, text: 'Ссылка обновлена — нажмите «Скачать» ещё раз' }
              : { kind, ok: false, text: 'Не получилось получить ссылку на файл. Проверьте интернет и повторите.' },
          ),
        )
        .finally(() => setBusy(null));
      return;
    }
    let job: Promise<void>;
    if (item?.url && insideMax) {
      const native = downloadFile(item.url, fileName);
      // Клиент MAX без downloadFile: качает только сам MAX, href в нём не работает
      job = native ?? Promise.reject(new Error('Обновите приложение MAX, чтобы скачивать файлы'));
    } else {
      job = api.practiceDoc(id, kind).then((blob) => saveBlob(blob, fileName));
    }
    haptic.selection();
    setBusy(kind);
    job
      .then(
        () => {
          haptic.notify('success');
          setNote({ kind, ok: true, text: `Скачали «${fileName}»` });
        },
        (err: unknown) => {
          haptic.notify('error');
          if (err instanceof ApiError && err.code === 'CONFLICT') {
            // Реквизиты стерли после загрузки экрана — показываем, что заполнить
            void refresh();
            if (employer) openRequisites();
            setNote({ kind, ok: false, text: err.message });
            return;
          }
          // Возможно, истекла ссылка: к повтору она будет свежей
          void refresh();
          setNote({ kind, ok: false, text: err instanceof Error && err.message ? err.message : 'Не получилось скачать. Повторите попытку.' });
        },
      )
      .finally(() => setBusy(null));
  };

  // Готовность — по ответу сервера, а не по форме: он решает, хватает ли реквизитов для договора
  const onSaved = () => {
    void refresh().then((next) => {
      setEditing(false);
      setSaved(
        next?.requisitesReady
          ? 'Реквизиты сохранены — договор и письмо можно скачать'
          : 'Реквизиты сохранены, но для договора и письма заполнены не все поля',
      );
    });
  };

  const place = docs.internship;
  const back = employer
    ? {
        label: place ? 'К кандидатам места' : 'К моим местам',
        go: () => backTo(navigate, place ? `/employer/internships/${place.id}/candidates` : '/employer'),
      }
    : { label: 'Все отклики', go: () => backTo(navigate, '/student/interests', STUDENT_TABS) };

  return (
    <main className="screen pdc">
      <div className="pdc-grid">
        <div className="pdc-main">
          <header className="pdc-head">
            {place && (
              <span className="cap pdc-place">
                Практика · {place.company} · {place.title}
              </span>
            )}
            <h1 className="h1 pdc-h">Документы для практики</h1>
            <p className="lead">
              {employer
                ? 'Данные компании, студента и вуза подставлены. Проверьте и подпишите по порядку вуза — мы ничего не подписываем.'
                : 'Договор и письмо собраны из данных компании, вашей анкеты и вуза. Подписывают по обычному порядку вуза.'}
            </p>
          </header>

          <section className="surf pdc-steps" aria-label="Кто что делает">
            <span className="cap">Кто что делает</span>
            <ol className="pdc-list">
              {STEPS.map((s, i) => (
                <li key={s.who}>
                  <span className="d pdc-n">{i + 1}</span>
                  <span className="grow">
                    <b>{s.who}</b> {s.text}
                    {s.role === side && <span className="st ok pdc-you">это вы</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <p className="lbl m0 pdc-form-note">
            Шаблоны по примерной форме приказа № 885/390. У вуза может быть своя форма — уточните в центре карьеры.
          </p>
        </div>

        <div className="pdc-side" ref={sideRef}>
          {editing ? (
            <RequisitesEditor onSaved={onSaved} onCancel={() => setEditing(false)} />
          ) : (
            <>
              {!ready && (
                <div className="pdc-alert" role="status">
                  <b>{employer ? 'Сначала реквизиты компании' : 'Компания ещё не заполнила реквизиты'}</b>
                  <span>
                    {employer
                      ? 'Без них договор и письмо не собрать. Шаблоны задания и отзыва можно скачать уже сейчас.'
                      : 'Договор и письмо появятся, когда компания их внесёт. Шаблоны задания и отзыва можно скачать уже сейчас.'}
                  </span>
                  {employer && (
                    <button type="button" className="btn sm pri" onClick={openRequisites}>
                      Заполнить реквизиты
                    </button>
                  )}
                </div>
              )}
              {saved && (
                <p className="pdc-saved" role="status" tabIndex={-1} data-focus>
                  {saved}
                </p>
              )}
              <ul className="surf pdc-docs" aria-label="Документы">
                {DOCS.map((d) => {
                  const locked = NEEDS_REQUISITES.has(d.kind) && !ready;
                  const mine = note?.kind === d.kind ? note : null;
                  return (
                    <li key={d.kind} className="pdc-doc">
                      <div className="pdc-doc-row">
                        <span className={locked ? 'ico pdc-ico off' : 'ico g pdc-ico'} aria-hidden="true">
                          <DocIcon />
                        </span>
                        <span className="col grow">
                          <span className="pdc-t">{d.title}</span>
                          <span className="lbl">
                            {locked && !employer ? 'Ждёт реквизитов компании' : d.hint}
                          </span>
                        </span>
                        {(!locked || employer) && (
                          <button
                            type="button"
                            className={locked ? 'btn sm sec pdc-get' : 'btn sm pri pdc-get'}
                            disabled={busy !== null}
                            aria-label={locked ? `Заполнить реквизиты для документа «${d.title}»` : `Скачать «${d.title}»`}
                            onClick={() => download(d.kind, d.title)}
                          >
                            {busy === d.kind ? 'Качаем…' : locked ? 'Реквизиты' : 'Скачать'}
                          </button>
                        )}
                      </div>
                      {mine && (
                        <p className={mine.ok ? 'pdc-note ok' : 'pdc-note bad'} role={mine.ok ? 'status' : 'alert'}>
                          {mine.text}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="lbl m0">Формат .docx — откроется в Word и LibreOffice, вуз поправит под свою форму.</p>
            </>
          )}
          {!editing && (
            <div className="actions pdc-foot">
              <button type="button" className="btn ghost" onClick={back.go}>
                {back.label}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/** Форма реквизитов прямо на экране документов: PUT профиля целиком, иначе сервер сотрёт название и город. */
function RequisitesEditor({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [state, retry] = useLoad(() => api.employerProfile(), []);
  if (state.status === 'loading') return <Skeleton lines={4} height={56} />;
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={retry} exit={false} />;
  return <RequisitesForm profile={state.data} onSaved={onSaved} onCancel={onCancel} />;
}

function RequisitesForm({
  profile,
  onSaved,
  onCancel,
}: {
  profile: EmployerProfile;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(() => requisitesForm(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const filled = requisitesFilled(form);
  // Форма появляется после загрузки профиля — фокус на заголовок ставим здесь: нажатая кнопка уже исчезла
  const headRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headRef.current?.focus({ preventScroll: true }), []);

  const set = (name: RequisiteName, value: string) => {
    setForm({ ...form, [name]: value });
    if (errors[name]) setErrors(Object.fromEntries(Object.entries(errors).filter(([k]) => k !== name)));
    if (formError) setFormError(null);
  };

  const focusFirst = (found: Record<string, string>) => {
    const field = REQUISITE_FIELDS.find((f) => f.name in found);
    if (field) document.getElementById(requisiteId(field.name))?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const found = checkRequisites(form);
    if (Object.keys(found).length) {
      setErrors(found);
      haptic.notify('error');
      focusFirst(found);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.saveEmployerProfile({
        companyName: profile.companyName,
        city: profile.city,
        contactName: profile.contactName,
        ...requisitesBody(form),
      });
      haptic.notify('success');
      onSaved();
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(0, 'INTERNAL', 'Не получилось сохранить. Повторите попытку.');
      haptic.notify('error');
      setErrors(apiErr.fields);
      setFormError(apiErr.message);
      focusFirst(apiErr.fields);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="pdc-req" noValidate onSubmit={(e) => void submit(e)}>
      <header className="col pdc-req-head">
        <h2 ref={headRef} className="h2 m0 pdc-req-h" tabIndex={-1}>
          Реквизиты компании
        </h2>
        <p className="lbl m0">
          Подставим их в договор и письмо о согласии. Сохранятся в профиле компании, студенты их не видят. Заполнено{' '}
          {filled.done} из {filled.total}.
        </p>
      </header>
      <RequisitesFields form={form} errors={errors} onChange={set} />
      {formError && (
        <p className="pf-alert" role="alert">
          {formError}
        </p>
      )}
      <div className="pf-foot pdc-req-foot">
        <button type="submit" className="btn pri" disabled={saving}>
          {saving ? 'Сохраняем…' : 'Сохранить реквизиты'}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>
          Отмена
        </button>
      </div>
    </form>
  );
}
