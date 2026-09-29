// Документы для практики (макет c3 Docs): чек-лист для компании после приглашения. Для стажировки и подработки —
// короткий вариант «Следующие шаги». Отметки — на этом устройстве, по паре (место, студент).
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import type { Candidate, Internship } from '../../api/types';
import { useData } from '../../api/useData';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { haptic } from '../../max/bridge';
import { fullName, loadPlaceData, paths, TYPE_TITLE } from './candidate';
import { ContactBlock } from './CandidateCard';
import { Avatar } from './candidateUi';
import { CheckIcon } from './icons';
import './employer.css';
import './places.css';

interface Step {
  id: string;
  title: string;
  hint?: string;
}

/** Практика: договор с вузом по приказу № 885/390, руководитель, задание, отзыв. Текст — черновик до сверки с центром карьеры. */
const PRACTICE: Step[] = [
  { id: 'call', title: 'Созвониться и договориться о первом дне' },
  {
    id: 'contract',
    title: 'Подписать с вузом договор о практической подготовке',
    hint: 'По приказу № 885/390 и положению вуза. Форму даёт центр карьеры.',
  },
  { id: 'mentor', title: 'Назначить руководителя практики от компании', hint: 'Он согласует задание и подпишет отзыв.' },
  { id: 'task', title: 'Согласовать индивидуальное задание', hint: 'Что студент сделает за время практики.' },
  { id: 'review', title: 'В конце практики выдать отзыв', hint: 'Его подписывает руководитель практики от компании.' },
];

/** Стажировка и подработка — без договора с вузом. */
const WORK: Step[] = [
  { id: 'terms', title: 'Договориться о задачах, графике и оплате' },
  { id: 'form', title: 'Решить, как оформить', hint: 'Обсудите со студентом, какой договор подойдёт вам обоим.' },
  { id: 'start', title: 'Созвониться и назначить первый день' },
];

const storageKey = (placeId: number, studentId: number) => `tandem.docs.${placeId}.${studentId}`;

function readDone(key: string): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeDone(key: string, done: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(done));
  } catch {
    // Хранилище недоступно (приватный режим) — отметки живут до закрытия экрана
  }
}

export function EmployerDocsScreen() {
  const params = useParams();
  const id = Number(params.id);
  const studentId = Number(params.studentId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(studentId) || studentId <= 0) {
    return <Navigate to="/employer" replace />;
  }
  return <DocsLoader key={`${id}-${studentId}`} id={id} studentId={studentId} />;
}

function DocsLoader({ id, studentId }: { id: number; studentId: number }) {
  const data = useData(() => loadPlaceData(id), [id]);
  if (data.state.status === 'loading') {
    return (
      <main className="screen emp dc">
        <Skeleton lines={1} height={64} />
        <Skeleton lines={4} height={72} />
      </main>
    );
  }
  if (data.state.status === 'error') {
    return (
      <main className="screen emp dc">
        <ErrorState error={data.state.error} onRetry={data.retry} />
      </main>
    );
  }
  const { place, items } = data.state.data;
  const c = items.find((x) => x.studentId === studentId);
  if (!c || c.status !== 'invited') return <Navigate to={paths.candidates(id)} replace />;
  return <Docs place={place} c={c} />;
}

function Docs({ place, c }: { place: Internship; c: Candidate }) {
  const practice = place.type === 'practice';
  const steps = practice ? PRACTICE : WORK;
  const key = storageKey(place.id, c.studentId);
  const [done, setDone] = useState<string[]>(() => readDone(key));
  const count = steps.filter((s) => done.includes(s.id)).length;
  const all = count === steps.length;

  const toggle = (stepId: string) => {
    const next = done.includes(stepId) ? done.filter((x) => x !== stepId) : [...done, stepId];
    const finished = steps.every((s) => next.includes(s.id));
    if (finished && !all) haptic.notify('success');
    else haptic.selection();
    setDone(next);
    writeDone(key, next);
  };

  return (
    <main className="screen emp dc">
      <header className="dc-who">
        <Avatar c={c} size={48} />
        <span className="col grow">
          <span className="dc-who-name">{fullName(c)}</span>
          <span className="lbl dc-who-place">
            {TYPE_TITLE[place.type] ?? 'Место'} · {place.title}
          </span>
        </span>
      </header>

      <section className="dc-intro">
        <h1 className="h1 dc-h">{practice ? 'Документы для практики' : 'Следующие шаги'}</h1>
        <p className="lead">
          {practice ? 'Что оформить, чтобы практику засчитали в вузе.' : 'Что обсудить со студентом до первого дня.'}
        </p>
        <span className="st warn dc-draft">Черновик, сверяем с центром карьеры</span>
      </section>

      <div className="dc-prog">
        <div className="dc-prog-row">
          <b className="num" aria-live="polite">
            {all ? 'Всё готово' : `Готово ${count} из ${steps.length}`}
          </b>
          <span className="lbl">отметки хранятся на этом устройстве</span>
        </div>
        <span className="track dc-track" aria-hidden="true">
          <span className="fill dc-fill" style={{ transform: `scaleX(${count / steps.length})` }} />
        </span>
      </div>

      <ul className="surf dc-list" aria-label={practice ? 'Что оформить' : 'Что обсудить'}>
        {steps.map((s, i) => {
          const on = done.includes(s.id);
          return (
            <li key={s.id} className="dc-li cd-in" style={{ animationDelay: `${i * 20}ms` }}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                className={on ? 'dc-item on' : 'dc-item'}
                onClick={() => toggle(s.id)}
              >
                <span className={on ? 'check on' : 'check'} aria-hidden="true">
                  {on && <CheckIcon className="ic xs" />}
                </span>
                <span className="col grow">
                  <span className="dc-t">{s.title}</span>
                  {s.hint && <span className="lbl dc-hint">{s.hint}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <section className="dc-contact" aria-label="Контакт студента">
        <span className="cap">Контакт студента</span>
        <ContactBlock c={c} place={place} compact docs={false} />
      </section>

      <div className="actions dc-foot">
        <Link className="btn pri" to={`${paths.candidates(place.id)}?tab=invited`}>
          К кандидатам места
        </Link>
        <Link className="btn ghost" to="/employer">
          К моим местам
        </Link>
      </div>
    </main>
  );
}
