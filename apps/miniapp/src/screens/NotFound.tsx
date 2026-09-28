import { useNavigate } from 'react-router';
import { EmptyState } from '../components/EmptyState';

export function NotFound() {
  const navigate = useNavigate();
  return (
    <main className="screen">
      <EmptyState
        title="Такого экрана нет"
        text="Вернитесь на главный экран и выберите роль."
        actionLabel="На главный"
        onAction={() => navigate('/', { replace: true })}
      />
    </main>
  );
}
