import { useMe } from '../app/me';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';

/** Раздел работодателя. Пока заглушка: профиль компании, форма места и «Мои места» — следующие задачи. */
export function EmployerHome() {
  const { me } = useMe();

  return (
    <main className="screen">
      <PageHeader title="Сводка" />
      {me.roles.employer ? (
        <EmptyState title="Сводка скоро появится" text="Здесь будут ваши места и отклики студентов." />
      ) : (
        <EmptyState
          title="Сначала профиль компании"
          text="Укажите компанию и город — после этого можно опубликовать место."
        />
      )}
    </main>
  );
}
