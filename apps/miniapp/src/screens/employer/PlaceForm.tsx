// Новое место: пошагово на телефоне (шаг — запись в истории, «Назад» MAX ведёт на прошлый шаг),
// одной страницей с живым превью на десктопе. Черновик — в localStorage, после публикации очищается.
import { useEffect, useMemo, useState, type ComponentType, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { api, ApiError } from '../../api/client';
import type { EmployerProfile, Items, Skills, Tag } from '../../api/types';
import { useLoad } from '../../api/useLoad';
import { useMe } from '../../app/me';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { haptic } from '../../max/bridge';
import {
  cityOf,
  draftStorage,
  EMPTY_DRAFT,
  errorOnStep,
  FORMAT_LABEL,
  firstErrorStep,
  plural,
  RELATED,
  REVIEW_STEP,
  rub,
  sanitize,
  shortDate,
  slotsText,
  splitServerFields,
  STEP_COUNT,
  STEPS,
  toInput,
  TYPE_LABEL,
  validateAll,
  validateStep,
  type Dict,
  type Draft,
  type Errors,
} from './draft';
import {
  DatesStep,
  DescriptionStep,
  PayStep,
  PlaceStep,
  SkillsStep,
  SlotsStep,
  TaskStep,
  TypeStep,
  type StepProps,
} from './formSteps';
import { PlacePreview } from './PlacePreview';
import { SavedMark } from './ui';
import { useDesktop } from './useDesktop';
import './employer.css';

const STEP_VIEWS: ComponentType<StepProps>[] = [
  TaskStep,
  TypeStep,
  SkillsStep,
  PlaceStep,
  DatesStep,
  PayStep,
  SlotsStep,
  DescriptionStep,
];
/** Блоки на всю ширину в десктопной форме; остальные — по два в ряд. */
const WIDE = new Set([0, 1, 2, 7]);

/** Позиция в истории: BrowserRouter хранит её в history.state.idx. */
const historyIndex = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0;

const BASE_KEY = 'tandem.employer.placeForm.base';

/**
 * Запись истории, с которой началась форма (шаг 1). После публикации возвращаемся к ней и заменяем её экраном
 * «Место опубликовано» — чтобы «Назад» не водила по шагам уже отправленной формы.
 */
function formBaseIndex(step: number, editing: boolean): number {
  const idx = historyIndex();
  if (step === 0 && !editing) {
    try {
      window.sessionStorage.setItem(BASE_KEY, String(idx));
    } catch {
      // без sessionStorage — посчитаем по номеру шага
    }
    return idx;
  }
  try {
    const saved = Number(window.sessionStorage.getItem(BASE_KEY));
    if (Number.isInteger(saved) && saved >= 0 && saved <= idx) return saved;
  } catch {
    // см. выше
  }
  return Math.max(0, idx - step);
}

const toApiError = (err: unknown): ApiError =>
  err instanceof ApiError ? err : new ApiError(0, 'INTERNAL', 'Что-то пошло не так. Повторите попытку.');

const loadForm = () => Promise.all([api.employerProfile(), api.skills(), api.tags()]);

export function PlaceForm() {
  const { me } = useMe();
  // Место публикуется от компании: без профиля — сначала он, после сохранения он вернёт сюда
  if (!me.roles.employer) return <Navigate to="/employer/profile" replace />;
  return <PlaceFormLoader userId={me.id} />;
}

function PlaceFormLoader({ userId }: { userId: number }) {
  const [state, retry] = useLoad(loadForm, []);

  if (state.status === 'loading') {
    return (
      <main className="screen">
        <Skeleton lines={4} />
      </main>
    );
  }
  if (state.status === 'error') {
    if (state.error.code === 'NOT_FOUND') return <Navigate to="/employer/profile" replace />;
    return (
      <main className="screen">
        <ErrorState error={state.error} onRetry={retry} />
      </main>
    );
  }
  const [profile, skills, tags] = state.data;
  return <PlaceFormBody userId={userId} profile={profile} skills={skills} tags={tags} />;
}

interface BodyProps {
  userId: number;
  profile: EmployerProfile;
  skills: Skills;
  tags: Items<Tag>;
}

function PlaceFormBody({ userId, profile, skills, tags }: BodyProps) {
  const desktop = useDesktop();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const dict = useMemo<Dict>(
    () => ({
      groups: skills.groups,
      skillName: new Map(skills.groups.flatMap((g) => g.skills.map((s) => [s.code, s.name] as const))),
      tags: tags.items,
      companyName: profile.companyName,
      defaultCity: profile.city,
    }),
    [skills, tags, profile],
  );

  const rawStep = Number(params.get('step') ?? 0);
  const step = Number.isInteger(rawStep) && rawStep >= 0 && rawStep <= REVIEW_STEP ? rawStep : 0;
  const editing = params.get('edit') === '1';

  const [initial] = useState(() => {
    const stored = draftStorage.load(userId);
    return { draft: sanitize(stored ?? EMPTY_DRAFT, dict), saved: stored !== null };
  });
  const [baseIdx] = useState(() => formBaseIndex(step, editing));
  const [draft, setDraft] = useState<Draft>(initial.draft);
  const [saved, setSaved] = useState(initial.saved);
  const [errors, setErrors] = useState<Errors>({});
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<number | null>(null);

  // Новый шаг — с начала экрана
  useEffect(() => {
    if (!desktop) window.scrollTo(0, 0);
  }, [step, desktop]);

  // После публикации ушли назад к первой записи формы — заменяем её экраном «Место опубликовано»
  useEffect(() => {
    if (publishedId !== null && historyIndex() <= baseIdx) {
      navigate(`/employer/internships/${publishedId}/published`, { replace: true });
    }
  }, [publishedId, baseIdx, navigate, params]);

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setSaved(draftStorage.save(userId, next));
    const touched = (Object.keys(patch) as (keyof Draft)[]).flatMap((k) => RELATED[k] ?? [k]);
    if (touched.some((k) => k in errors)) {
      setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !touched.includes(k))));
    }
    if (publishError) setPublishError(null);
  };

  const goToStep = (k: number) => {
    if (desktop) {
      document.getElementById(`pf-blk-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // Правка с экрана проверки: «Готово» вернёт назад к проверке, а не поведёт по всем шагам
      navigate({ search: `?step=${k}&edit=1` });
    }
  };

  const goNext = () => {
    const found = validateStep(step, draft, dict.defaultCity);
    if (Object.keys(found).length) {
      setErrors((prev) => ({ ...prev, ...found }));
      haptic.notify('error');
      return;
    }
    haptic.impact('light');
    if (editing) navigate(-1);
    else navigate({ search: `?step=${step + 1}` });
  };

  const finish = (id: number) => {
    const back = baseIdx - historyIndex();
    if (back < 0) {
      setPublishedId(id);
      navigate(back);
    } else {
      navigate(`/employer/internships/${id}/published`, { replace: true });
    }
  };

  const publish = async () => {
    if (publishing) return;
    const found = validateAll(draft, dict.defaultCity);
    const bad = firstErrorStep(found);
    if (bad !== null) {
      setErrors(found);
      haptic.notify('error');
      goToStep(bad);
      return;
    }
    setPublishing(true);
    setPublishError(null);
    try {
      const place = await api.createInternship(toInput(draft, dict.defaultCity));
      draftStorage.clear(userId);
      haptic.notify('success');
      finish(place.id);
    } catch (err) {
      const e = toApiError(err);
      haptic.notify('error');
      const { byField, other } = splitServerFields(e.fields);
      const k = firstErrorStep(byField);
      setErrors(byField);
      if (other.length || k === null) setPublishError([e.message, ...other].join('. '));
      if (k !== null) goToStep(k);
    } finally {
      setPublishing(false);
    }
  };

  if (publishedId !== null) {
    return (
      <main className="screen">
        <Skeleton lines={3} />
      </main>
    );
  }

  const stepProps = { draft, update, errors, dict };

  if (desktop) {
    return (
      <main className="pf-desk">
        <div className="pf-desk-main">
          <header className="pf-desk-head">
            <span className="lbl pf-saved-row">
              Новое место
              {saved && (
                <>
                  <span aria-hidden="true">·</span>
                  <SavedMark />
                </>
              )}
            </span>
            <h1 className="h1">Опишите задачу — карточка собирается справа</h1>
          </header>
          <div className="pf-blocks">
            {STEP_VIEWS.map((View, i) => (
              <section
                key={i}
                id={`pf-blk-${i}`}
                className={WIDE.has(i) ? 'pf-blk wide' : 'pf-blk'}
                aria-labelledby={`pf-blk-${i}-t`}
              >
                <h2 id={`pf-blk-${i}-t`} className="lbl pf-blk-t">
                  {i + 1} · {STEPS[i].label}
                </h2>
                <View {...stepProps} compact />
              </section>
            ))}
          </div>
        </div>
        <aside className="pf-desk-side">
          <span className="cap">Так увидят студенты</span>
          <PlacePreview draft={draft} dict={dict} />
          {publishError && (
            <p className="pf-alert" role="alert">
              {publishError}
            </p>
          )}
          <button type="button" className="btn pri" disabled={publishing} onClick={() => void publish()}>
            {publishing ? 'Публикуем…' : 'Опубликовать'}
          </button>
          <span className="lbl pf-center">Бот разошлёт карточку студентам с совпадением от 60 %</span>
        </aside>
      </main>
    );
  }

  const View = step < REVIEW_STEP ? STEP_VIEWS[step] : null;
  const meta = step < REVIEW_STEP ? STEPS[step] : null;
  const submitLabel =
    step === REVIEW_STEP
      ? publishing
        ? 'Публикуем…'
        : 'Опубликовать'
      : editing
        ? 'Готово — к проверке'
        : step === STEP_COUNT - 1
          ? 'К проверке'
          : 'Дальше';

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step === REVIEW_STEP) void publish();
    else goNext();
  };

  return (
    <main className="screen">
      <form className="pf-form" noValidate onSubmit={onSubmit}>
        <div
          className="pf-prog"
          role="progressbar"
          aria-label="Шаги формы"
          aria-valuemin={1}
          aria-valuemax={STEP_COUNT}
          aria-valuenow={Math.min(step + 1, STEP_COUNT)}
        >
          {STEPS.map((_, i) => (
            <i key={i} className={i <= step ? 'on' : undefined} />
          ))}
        </div>
        <div className="pf-meta">
          <span className="lbl">Новое место · {step < REVIEW_STEP ? `${step + 1} из ${STEP_COUNT}` : 'проверка'}</span>
          {saved && <SavedMark />}
        </div>

        {View && meta ? (
          <section className="pf-body" key={step}>
            <h1 className="pf-q">{meta.question}</h1>
            {meta.sub && <p className="lead pf-sub">{meta.sub}</p>}
            <View {...stepProps} compact={false} />
          </section>
        ) : (
          <Review draft={draft} dict={dict} errors={errors} onEdit={goToStep} />
        )}

        <div className="pf-foot">
          {step === REVIEW_STEP && publishError && (
            <p className="pf-alert" role="alert">
              {publishError}
            </p>
          )}
          <button type="submit" className="btn pri" disabled={publishing}>
            {submitLabel}
          </button>
          {step === REVIEW_STEP && <span className="lbl pf-center">Бот разошлёт карточку студентам с совпадением от 60 %</span>}
        </div>
      </form>
    </main>
  );
}

// ---------- проверка карточки (телефон) ----------

function summary(i: number, d: Draft, dict: Dict): string {
  switch (i) {
    case 0: {
      const tagNames = d.tags.map((c) => dict.tags.find((t) => t.code === c)?.name ?? c);
      return [d.title.trim(), tagNames.join(', ')].filter(Boolean).join(' · ');
    }
    case 1:
      return d.type ? TYPE_LABEL[d.type] : '';
    case 2:
      return d.requiredSkills.length
        ? `${d.requiredSkills.length} ${plural(d.requiredSkills.length, ['обязательный', 'обязательных', 'обязательных'])}, ` +
            `${d.niceSkills.length} ${plural(d.niceSkills.length, ['желательный', 'желательных', 'желательных'])}`
        : '';
    case 3:
      if (!d.format) return '';
      return d.format === 'remote'
        ? FORMAT_LABEL.remote
        : [FORMAT_LABEL[d.format], cityOf(d, dict.defaultCity)].filter(Boolean).join(', ');
    case 4:
      return d.startsOn && d.endsOn ? `${shortDate(d.startsOn)} — ${shortDate(d.endsOn)}` : '';
    case 5:
      if (d.paid === null) return '';
      return d.paid ? (d.salary ? `${rub(d.salary)} в месяц` : 'Оплачивается') : 'Без оплаты';
    case 6:
      return slotsText(d.slots);
    case 7:
      return d.description.trim() ? `${d.description.trim().length} символов` : 'Без описания';
    default:
      return '';
  }
}

interface ReviewProps {
  draft: Draft;
  dict: Dict;
  errors: Errors;
  onEdit: (step: number) => void;
}

function Review({ draft, dict, errors, onEdit }: ReviewProps) {
  const description = draft.description.trim();
  return (
    <section className="pf-body">
      <h1 className="pf-q">Проверьте карточку</h1>
      <p className="lead pf-sub">Так её увидят студенты. Процент совпадения каждый увидит свой.</p>
      <PlacePreview draft={draft} dict={dict} />
      {description && (
        <div className="surf pf-desc">
          <span className="lbl">Описание</span>
          <p>{description}</p>
        </div>
      )}
      <div className="surf">
        {STEPS.map((s, i) => {
          const problem = errorOnStep(errors, i) ?? errorOnStep(validateStep(i, draft, dict.defaultCity), i);
          return (
            <button key={i} type="button" className={problem ? 'li pf-edit bad' : 'li pf-edit'} onClick={() => onEdit(i)}>
              <span className="col grow">
                <span>{s.edit}</span>
                <span className="lbl">{problem ?? (summary(i, draft, dict) || '—')}</span>
              </span>
              <span className="pf-edit-a">Изменить</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
