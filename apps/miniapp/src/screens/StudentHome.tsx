import { useMe } from '../app/me';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';

/** Раздел студента. Пока заглушка: онбординг, анкета и лента — следующие задачи. */
export function StudentHome() {
  const { me } = useMe();

  return (
    <main className="screen">
      <PageHeader title="Места для вас" />
      {me.roles.student ? (
        <EmptyState title="Лента скоро появится" text="Здесь будут места, подходящие под ваши навыки." />
      ) : (
        <EmptyState
          title="Сначала анкета"
          text="Заполните короткую анкету — и мы покажем только подходящие места."
        />
      )}
    </main>
  );
}
