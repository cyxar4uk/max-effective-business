import { useIsPresent } from 'motion/react';
import { useState } from 'react';
import { useMe } from '../app/me';
import { ProfileFormScreen } from './student/ProfileForm';
import { StudentFeed } from './student/StudentFeed';
import { RequireConsent, StudentShell } from './student/StudentShell';

/** Раздел студента `/student`: нет согласия — онбординг, нет анкеты — анкета, иначе колода мест. */
export function StudentHome() {
  const { me } = useMe();
  // Экран уходит (после анкеты — на место из QR-кода): не подменяем анкету колодой посреди перехода.
  // Иначе колода смонтируется в уходящем экране, motion не дождётся конца его анимации и экран останется в DOM.
  const present = useIsPresent();
  const [hasProfile, setHasProfile] = useState(me.roles.student);
  if (present && hasProfile !== me.roles.student) setHasProfile(me.roles.student);

  return (
    <RequireConsent>
      {hasProfile ? (
        <StudentShell>
          <StudentFeed />
        </StudentShell>
      ) : (
        <ProfileFormScreen mode="new" />
      )}
    </RequireConsent>
  );
}
