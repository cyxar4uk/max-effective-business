import { useNavigate } from 'react-router';

/** Шапка раздела роли: заголовок и переход к выбору роли — чтобы из раздела всегда был выход. */
export function PageHeader({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <header className="page-head">
      <h1 className="h1">{title}</h1>
      <button type="button" className="btn ghost sm" onClick={() => navigate('/')}>
        Сменить роль
      </button>
    </header>
  );
}
