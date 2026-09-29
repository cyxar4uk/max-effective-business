import { InterestsList } from './InterestsList';
import { RequireConsent, StudentShell } from './StudentShell';

/** Вкладка «Отклики» `/student/interests`: приглашения, ожидание ответа и отказы — с контактом после приглашения. */
export function StudentInterests() {
  return (
    <RequireConsent>
      <StudentShell>
        <main className="sp">
          <div className="top sp-top">
            <h1 className="d m0 feed-h1">Отклики</h1>
          </div>
          <InterestsList />
        </main>
      </StudentShell>
    </RequireConsent>
  );
}
