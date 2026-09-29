import { Navigate, useNavigate, useParams } from 'react-router';
import { CheckIcon } from './icons';
import './employer.css';

/** «Место опубликовано»: что будет дальше и куда идти. */
export function PlacePublished() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  if (!Number.isInteger(id) || id <= 0) return <Navigate to="/employer" replace />;

  return (
    <main className="screen">
      <section className="pf-done">
        <span className="pf-done-ic" aria-hidden="true">
          <CheckIcon className="ic lg" />
        </span>
        <h1 className="h1">Место опубликовано</h1>
        <p className="lead">
          Бот разошлёт карточку студентам с совпадением от 60 %. Когда кто-то нажмёт «Интересно», вам придёт сообщение.
        </p>
        <p className="pf-note" role="note">
          В демо на новое место сразу откликаются тестовые студенты — они отмечены.
        </p>
      </section>
      <div className="actions">
        <button type="button" className="btn pri" onClick={() => navigate(`/employer/internships/${id}/candidates`)}>
          Смотреть кандидатов
        </button>
        <button type="button" className="btn sec" onClick={() => navigate('/employer', { replace: true })}>
          К моим местам
        </button>
      </div>
    </main>
  );
}
