import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { haptic } from '../../max/bridge';
import { CheckIcon, InfoIcon } from './icons';
import './employer.css';

/** Состояние перехода из формы: место только что опубликовано (а не открыто повторно кнопкой «Назад»). */
export interface PublishedState {
  justPublished: true;
}

const isJustPublished = (state: unknown): boolean =>
  typeof state === 'object' && state !== null && (state as Partial<PublishedState>).justPublished === true;

/** «Место опубликовано»: что будет дальше и куда идти. */
export function PlacePublished() {
  const id = Number(useParams().id);
  if (!Number.isInteger(id) || id <= 0) return <Navigate to="/employer" replace />;
  return <Published id={id} />;
}

function Published({ id }: { id: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Галочка вспрыгивает и телефон откликается только сразу после публикации
  const [fresh] = useState(() => isJustPublished(location.state));

  useEffect(() => {
    if (!fresh) return;
    haptic.notify('success');
    // Снимаем отметку: при возврате на этот экран отклик и анимация не повторяются
    navigate(location.pathname, { replace: true, state: null });
    // Один раз при появлении экрана
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className={fresh ? 'screen emp pf-fresh' : 'screen emp'}>
      <section className="pf-done">
        <span className="pf-done-ic" aria-hidden="true">
          <CheckIcon className="ic lg" />
        </span>
        <h1 className="h1 pf-rise">Место опубликовано</h1>
        <p className="lead pf-rise">
          Бот отправит карточку студентам с совпадением от 60 %. Когда кто-то нажмёт «Интересно», вам придёт сообщение.
        </p>
        <div className="pf-note pf-rise" role="note">
          <InfoIcon />
          <span className="col">
            <b>В демо отклики приходят сразу</b>
            <span>На новое место откликаются до 5 подходящих тестовых студентов — они помечены как тестовые.</span>
          </span>
        </div>
      </section>
      <div className="actions pf-rise">
        <button type="button" className="btn pri" onClick={() => navigate(`/employer/internships/${id}/candidates`)}>
          Смотреть кандидатов
        </button>
        <button type="button" className="btn sec" onClick={() => navigate('/employer', { replace: true })}>
          Мои места
        </button>
      </div>
    </main>
  );
}
