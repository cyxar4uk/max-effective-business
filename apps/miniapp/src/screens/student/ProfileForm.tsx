import { motion } from 'motion/react';
import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { api, ApiError } from '../../api/client';
import type { Me, Skills, StudentProfile, WorkFormat } from '../../api/types';
import { useLoad } from '../../api/useLoad';
import type { AsStudentState } from '../../app/launchState';
import { parsePlaceId } from '../../app/placeParam';
import { useMe } from '../../app/me';
import { useEdgeFade } from '../../components/useEdgeFade';
import { flash } from '../../components/flashMessage';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { haptic } from '../../max/bridge';
import { useReduced } from '../../motion/springs';
import { listItem } from '../../motion/variants';
import { useBubbleLooks } from './bubble';
import { loadSkills } from './dict';
import { FORMAT_LABEL, FORMATS, groupCover, MONTHS } from './place';
import { Icon } from './ui';

const MIN_SKILLS = 3;
const MAX_SKILLS = 30;
/** Пузырь навыка не из справочника (не бывает, но на всякий случай). */
const SIZE_FALLBACK = 132;
const DEFAULT_UNIVERSITY = 'РАНХиГС';

interface Draft {
  university: string;
  faculty: string | null;
  direction: string;
  city: string;
  course: number | null;
  formats: WorkFormat[];
  skills: string[];
  practiceMonth: string | null;
}

type Errors = Partial<Record<keyof Draft, string>>;

const STEP1_FIELDS: (keyof Draft)[] = ['university', 'direction', 'city', 'course', 'formats', 'practiceMonth', 'faculty'];
const FIELD_LABEL: Partial<Record<keyof Draft, string>> = {
  university: 'Вуз',
  faculty: 'Факультет',
  direction: 'Направление',
  city: 'Город',
  course: 'Курс',
  formats: 'Формат',
  practiceMonth: 'Месяц практики',
};

function toDraft(p: StudentProfile | null): Draft {
  return {
    university: p?.university ?? DEFAULT_UNIVERSITY,
    faculty: p?.faculty ?? null,
    direction: p?.direction ?? '',
    city: p?.city ?? '',
    course: p?.course ?? null,
    formats: p?.formats ?? [],
    skills: p?.skills ?? [],
    practiceMonth: p?.practiceMonth ?? null,
  };
}

/** Следующие четыре месяца от текущего: `ГГГГ-ММ` и подпись. */
function monthOptions(current: string | null): { value: string; label: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const list: { value: string; label: string }[] = [];
  for (let i = 1; i <= 4; i++) {
    const d = new Date(year, now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    list.push({ value, label: MONTHS[d.getMonth()] + (d.getFullYear() !== year ? ` ${d.getFullYear()}` : '') });
  }
  const m = current ? /^(\d{4})-(\d{2})$/.exec(current) : null;
  if (m && current && !list.some((o) => o.value === current)) {
    list.unshift({ value: current, label: `${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}` });
  }
  return list;
}

/** Ошибки сервера по полям: путь через точку (`skills.3`) — берём первое звено. */
function fieldErrors(fields: Record<string, string>): Errors {
  const out: Errors = {};
  for (const [path, message] of Object.entries(fields)) {
    const key = path.split('.')[0] as keyof Draft;
    if (!out[key]) out[key] = message;
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();

/** Позиция в истории: BrowserRouter хранит её в history.state.idx. */
const historyIndex = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0;

interface ProfileFormProps {
  mode: 'new' | 'edit';
  initial: StudentProfile | null;
  skills: Skills;
  /** Навык, который надо сразу отметить («Умею — добавить» в подробностях места). */
  addSkill: string | null;
}

/**
 * Анкета студента в два шага: о себе и навыки. Шаг — в адресе (`?step=skills`), чтобы «Назад» MAX
 * возвращала к первому шагу, а не закрывала анкету. Черновик живёт в состоянии и не теряется при ошибке.
 */
function ProfileForm({ mode, initial, skills, addSkill }: ProfileFormProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = useReduced();
  const [params] = useSearchParams();
  const { me, setMe } = useMe();
  const chipsRef = useEdgeFade<HTMLDivElement>();
  const step = params.get('step') === 'skills' ? 2 : 1;
  // Анкету открыли с экрана места («Заполнить анкету»): /student?place=<id> лежит в истории прямо над ним
  const placeId = mode === 'new' ? parsePlaceId(params.get('place')) : null;
  /** Адрес анкеты с нужным шагом; остальные параметры (place) сохраняются. */
  const searchWithStep = (next: 'skills' | null) => {
    const p = new URLSearchParams(params);
    if (next) p.set('step', next);
    else p.delete('step');
    const query = p.toString();
    return query ? `?${query}` : '';
  };
  const cameFromStep1 = (location.state as { fromStep1?: boolean } | null)?.fromStep1 === true;

  const [draft, setDraft] = useState<Draft>(() => {
    const d = toDraft(initial);
    const known = skills.groups.some((g) => g.skills.some((s) => s.code === addSkill));
    if (addSkill && known && !d.skills.includes(addSkill) && d.skills.length < MAX_SKILLS) d.skills = [...d.skills, addSkill];
    return d;
  });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  // Счётчик неудачных попыток: после каждой показываем первую ошибку (баннер или поле), даже если она за краем экрана
  const [failed, setFailed] = useState(0);

  // Новый шаг — с начала экрана: меняется только ?step, и прокрутку при этом ведёт сама анкета (motion/AnimatedRoutes)
  const shownStep = useRef(step);
  useLayoutEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    window.scrollTo(0, 0);
  }, [step]);

  useEffect(() => {
    if (!failed) return;
    document
      .querySelector('.sf-banner, .sf .field.err, .sf .field-err')
      ?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [failed, reduced]);

  const months = useMemo(() => monthOptions(initial?.practiceMonth ?? null), [initial]);
  const looks = useBubbleLooks(skills);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validateStep1 = (): Errors => {
    const e: Errors = {};
    if (!draft.university.trim()) e.university = 'Укажите вуз';
    if (!draft.direction.trim()) e.direction = 'Укажите направление';
    if (!draft.city.trim()) e.city = 'Укажите город';
    if (!draft.course) e.course = 'Выберите курс';
    if (draft.formats.length === 0) e.formats = 'Выберите хотя бы один формат';
    return e;
  };

  const goStep2 = () => {
    const e = validateStep1();
    setErrors(e);
    // Баннер — от прошлой попытки сохранить: на шаге 1 он устарел и перехватил бы прокрутку к ошибке
    setMessage(null);
    if (Object.keys(e).length > 0) {
      haptic.notify('error');
      setFailed((n) => n + 1);
      return;
    }
    navigate({ search: searchWithStep('skills') }, { state: { fromStep1: true } });
  };

  const goStep1 = () => {
    if (cameFromStep1) navigate(-1);
    else navigate({ search: searchWithStep(null) }, { replace: true });
  };

  /**
   * После сохранения: из редактирования — туда, откуда пришли; новая анкета — к месту, ради которого её заполняли
   * (QR на ярмарке, «Посмотреть как студент»), иначе к колоде. student — пользователь с анкетой, если она новая:
   * его подставляем вместе со сменой адреса, чтобы уходящий экран анкеты не успел перерисоваться колодой.
   */
  const leave = (student: Me | null) => {
    if (placeId !== null) {
      // Возвращаемся шагами назад на ту же запись экрана места — без дубля в истории: «Назад» с места ведёт туда же,
      // откуда на него пришли (кандидаты, главный), а «Назад» с согласия и анкеты — на место. Истории нет
      // (открыли адрес напрямую) — просто открываем место
      const steps = (cameFromStep1 ? 1 : 0) + 1;
      if (historyIndex() >= steps) {
        // Адрес сменится по popstate — тогда же (одним переходом с роутером) обновляем пользователя
        if (student) window.addEventListener('popstate', () => startTransition(() => setMe(student)), { once: true });
        navigate(-steps);
      } else {
        if (student) setMe(student);
        navigate(`/internships/${placeId}`, { replace: true, state: { asStudent: true } satisfies AsStudentState });
      }
      return;
    }
    if (student) setMe(student);
    const back = (cameFromStep1 ? 1 : 0) + (mode === 'edit' ? 1 : 0);
    if (back > 0 && historyIndex() >= back) navigate(-back);
    else navigate(mode === 'edit' ? '/student/profile' : '/student', { replace: true });
  };

  const save = async () => {
    const e = validateStep1();
    if (draft.skills.length < MIN_SKILLS) e.skills = `Выберите хотя бы ${MIN_SKILLS} навыка`;
    setErrors(e);
    if (Object.keys(e).length > 0) {
      haptic.notify('error');
      setMessage('Проверьте анкету');
      setFailed((n) => n + 1);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await api.saveStudentProfile({
        university: draft.university.trim(),
        faculty: draft.faculty,
        direction: draft.direction.trim(),
        city: draft.city.trim(),
        course: draft.course!,
        formats: draft.formats,
        skills: draft.skills,
        practiceMonth: draft.practiceMonth,
      });
      haptic.notify('success');
      if (mode === 'edit') flash('Анкета сохранена — подбор мест обновлён');
      // Пользователь и адрес меняются одним переходом (роутер меняет адрес в startTransition): уходящий экран
      // анкеты сразу помечен уходящим и не перерисовывается колодой (StudentHome, useScreenPresent)
      const student = me.roles.student ? null : { ...me, roles: { ...me.roles, student: true } };
      startTransition(() => leave(student));
    } catch (err) {
      haptic.notify('error');
      const apiErr = err instanceof ApiError ? err : null;
      setErrors(apiErr ? fieldErrors(apiErr.fields) : {});
      setMessage(apiErr?.message ?? 'Не получилось сохранить. Повторите.');
      setSaving(false);
      setFailed((n) => n + 1);
    }
  };

  const toggleSkill = (code: string) => {
    if (draft.skills.includes(code)) {
      haptic.selection();
      set(
        'skills',
        draft.skills.filter((c) => c !== code),
      );
      return;
    }
    if (draft.skills.length >= MAX_SKILLS) {
      haptic.notify('warning');
      setErrors((e) => ({ ...e, skills: `Не больше ${MAX_SKILLS} навыков` }));
      return;
    }
    haptic.selection();
    set('skills', [...draft.skills, code]);
  };

  const progress = (
    <div className="sf-prog" aria-hidden="true">
      <i className="on" />
      <i className={step === 2 ? 'on' : undefined} />
    </div>
  );

  const banner = message && (
    <div className="sf-banner" role="alert">
      <strong>{message}</strong>
      {step === 2 &&
        STEP1_FIELDS.filter((k) => errors[k]).map((k) => (
          <span key={k}>
            {FIELD_LABEL[k]}: {errors[k]}
          </span>
        ))}
    </div>
  );

  if (step === 1) {
    const text = (key: 'university' | 'direction' | 'city', label: string, max: number, hint?: string) => (
      <div className={errors[key] ? 'field err' : 'field'}>
        <label htmlFor={`sf-${key}`}>{label}</label>
        <input
          id={`sf-${key}`}
          value={draft[key]}
          maxLength={max}
          placeholder={hint}
          enterKeyHint="next"
          aria-invalid={Boolean(errors[key])}
          onChange={(e) => set(key, e.target.value)}
        />
        {errors[key] && <span className="field-err">{errors[key]}</span>}
      </div>
    );
    return (
      <main className="sf">
        {progress}
        <div className="sf-head">
          <span className="lbl">Анкета · 1 из 2{mode === 'new' && ' · около 2 минут'}</span>
          <h1 className="d m0 sf-h1">{mode === 'edit' ? 'Анкета' : <>Расскажите о&nbsp;себе</>}</h1>
          {mode === 'new' && (
            <p className="m0 sf-why">
              Заполните один раз — бот сам пришлёт места, где нужны ваши навыки. Компания увидит анкету, только если вы
              откликнетесь.
            </p>
          )}
        </div>
        <div className="sf-body">
          {banner}
          <div className="surf">
            {text('university', 'Вуз', 200)}
            {text('direction', 'Направление', 200, 'Например, «Маркетинг»')}
            {text('city', 'Город', 100, 'Например, «Москва»')}
          </div>
          <div className="col sf-group">
            <span className="lbl">Курс</span>
            <div className="chips" role="group" aria-label="Курс">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={draft.course === n ? 'chip on' : 'chip'}
                  aria-pressed={draft.course === n}
                  onClick={() => set('course', n)}
                >
                  {n}
                </button>
              ))}
            </div>
            {errors.course && <span className="field-err">{errors.course}</span>}
          </div>
          <div className="col sf-group">
            <span className="lbl">Формат — можно несколько</span>
            <div className="chips" role="group" aria-label="Формат">
              {FORMATS.map((f) => {
                const on = draft.formats.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    className={on ? 'chip on' : 'chip'}
                    aria-pressed={on}
                    onClick={() => set('formats', on ? draft.formats.filter((x) => x !== f) : [...draft.formats, f])}
                  >
                    {FORMAT_LABEL[f]}
                  </button>
                );
              })}
            </div>
            {errors.formats && <span className="field-err">{errors.formats}</span>}
          </div>
          <div className="col sf-group">
            {/* Один месяц, в отличие от форматов выше: подпись говорит об этом, чтобы второй тап не казался ошибкой */}
            <span className="lbl">Месяц практики — один, по желанию</span>
            <div className="chips" role="radiogroup" aria-label="Месяц практики">
              {months.map((m) => {
                const on = draft.practiceMonth === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    className={on ? 'chip on' : 'chip'}
                    role="radio"
                    aria-checked={on}
                    onClick={() => set('practiceMonth', on ? null : m.value)}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            {errors.practiceMonth && <span className="field-err">{errors.practiceMonth}</span>}
          </div>
        </div>
        <div className="sf-foot">
          <button type="button" className="btn pri" onClick={goStep2}>
            Дальше — навыки
          </button>
        </div>
      </main>
    );
  }

  const q = norm(query);
  const groups = skills.groups
    .map((g, i) => ({ ...g, color: groupCover(g.name, i) }))
    .filter((g) => !group || g.name === group);
  const shown = q
    ? groups.flatMap((g) => g.skills.filter((s) => norm(s.name).includes(q)).map((s) => ({ ...s, color: g.color })))
    : null;
  const count = draft.skills.length;

  const bubble = (s: { code: string; name: string; color: string }) => {
    const on = draft.skills.includes(s.code);
    const { size, fontSize } = looks.get(s.code) ?? { size: SIZE_FALLBACK };
    return (
      <button
        key={s.code}
        type="button"
        className={on ? 'bub on' : 'bub'}
        style={{ width: size, height: size }}
        aria-pressed={on}
        onClick={() => toggleSkill(s.code)}
      >
        {on && <i className={`cover ${s.color}`} aria-hidden="true" />}
        <span style={fontSize ? { fontSize } : undefined}>{s.name}</span>
        {on && (
          <i className="ck" aria-hidden="true">
            <Icon name="check" size="sm" style={{ strokeWidth: 3 }} />
          </i>
        )}
      </button>
    );
  };

  return (
    <main className="sf">
      {progress}
      <div className="sf-head">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="lbl">Анкета · 2 из 2</span>
          <button type="button" className="btn ghost sm sf-back" onClick={goStep1}>
            ← Вуз, курс, формат
          </button>
        </div>
        <h1 className="d m0 sf-h1">Что вы умеете?</h1>
        <p className="m0 sf-why">
          Отмечайте то, что уже делали сами: в учёбе, проекте или на подработке. Компания увидит отметки и спросит о них
          на созвоне. От {MIN_SKILLS} до {MAX_SKILLS} навыков.
        </p>
      </div>
      <div className="sf-tools">
        {banner}
        <label className="search" htmlFor="sf-q">
          <Icon name="search" size="sm" />
          <input
            id="sf-q"
            type="search"
            placeholder="Найти навык"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
          />
        </label>
      </div>
      <div ref={chipsRef} className="chips feed-chips" role="group" aria-label="Группы навыков">
        <button type="button" className={group === null ? 'chip on' : 'chip'} aria-pressed={group === null} onClick={() => setGroup(null)}>
          Все
        </button>
        {skills.groups.map((g) => (
          <button
            key={g.name}
            type="button"
            className={group === g.name ? 'chip on' : 'chip'}
            aria-pressed={group === g.name}
            onClick={() => setGroup(g.name)}
          >
            {g.name}
          </button>
        ))}
      </div>
      <div className="sf-skills">
        {shown ? (
          shown.length > 0 ? (
            <div className="bubbles">{shown.map(bubble)}</div>
          ) : (
            <p className="state-text sf-none">Ничего не нашли. Попробуйте другое слово или группу «Все».</p>
          )
        ) : (
          groups.map((g, i) => (
            <motion.section key={g.name} className="sf-sgroup" aria-label={g.name} {...listItem(i, reduced)}>
              {!group && <span className="cap">{g.name}</span>}
              <div className="bubbles">{g.skills.map((s) => bubble({ ...s, color: g.color }))}</div>
            </motion.section>
          ))
        )}
      </div>
      <div className="sf-foot">
        {errors.skills && <span className="field-err sf-skills-err">{errors.skills}</span>}
        <button type="button" className={count < MIN_SKILLS ? 'btn pri sf-few' : 'btn pri'} onClick={save} disabled={saving || count < MIN_SKILLS}>
          {saving
            ? 'Сохраняем…'
            : count < MIN_SKILLS
              ? `Выберите ещё ${MIN_SKILLS - count}`
              : `Готово · выбрано ${count}`}
        </button>
      </div>
    </main>
  );
}

/**
 * Экран анкеты: новая (раздел студента без анкеты) или редактирование (`/student/profile/edit`).
 * Для редактирования грузим анкету: 404 — анкеты ещё нет, заполняем с нуля.
 */
export function ProfileFormScreen({ mode }: { mode: 'new' | 'edit' }) {
  const [params] = useSearchParams();
  const [state, retry] = useLoad(async () => {
    const profile =
      mode === 'edit'
        ? api.studentProfile().catch((err: unknown) => {
            if (err instanceof ApiError && err.code === 'NOT_FOUND') return null;
            throw err;
          })
        : Promise.resolve(null);
    const [p, s] = await Promise.all([profile, loadSkills()]);
    return { profile: p, skills: s };
  }, [mode]);

  if (state.status === 'loading') {
    return (
      <main className="screen">
        <Skeleton lines={5} height={56} />
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
  return <ProfileForm mode={mode} initial={state.data.profile} skills={state.data.skills} addSkill={params.get('add')} />;
}
