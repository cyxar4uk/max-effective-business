import { InterestsList } from './student/InterestsList';

/**
 * «Мои отклики» студента. Когда в main появится раздел студента Ильи (StudentShell с нижней навигацией),
 * список переезжает в его StudentInterests вместо заглушки, а этот экран удаляется.
 */
export function MyInterestsScreen() {
  return (
    <main className="screen">
      <header className="page-head">
        <h1 className="h1">Мои отклики</h1>
      </header>
      <InterestsList />
    </main>
  );
}
