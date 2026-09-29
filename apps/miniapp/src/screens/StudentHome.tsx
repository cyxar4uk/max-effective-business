import { useMe } from '../app/me';
import { ProfileFormScreen } from './student/ProfileForm';
import { StudentFeed } from './student/StudentFeed';
import { RequireConsent, StudentShell } from './student/StudentShell';

/** Раздел студента `/student`: нет согласия — онбординг, нет анкеты — анкета, иначе колода мест. */
export function StudentHome() {
  const { me } = useMe();
  return (
    <RequireConsent>
      {me.roles.student ? (
        <StudentShell>
          <StudentFeed />
        </StudentShell>
      ) : (
        <ProfileFormScreen mode="new" />
      )}
    </RequireConsent>
  );
}
