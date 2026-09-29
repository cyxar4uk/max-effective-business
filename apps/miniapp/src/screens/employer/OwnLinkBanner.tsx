// Владелец открыл ссылку на своё место (QR-плакат камерой, кнопка бота) и попал к кандидатам — это поведение
// ссылки не меняем. Плашка над списком предлагает посмотреть место глазами студента: так владелец проверяет
// сценарий стенда одним аккаунтом. Закрыл — в этом запуске больше не показываем.
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { AsStudentState, OwnLinkState } from '../../app/launchState';
import { haptic } from '../../max/bridge';
import { fade, spring, useReduced } from '../../motion/springs';
import { CrossIcon, QrIcon } from './icons';

const KEY = 'tandem.ownLinkHidden';
/** Запасной вариант, если sessionStorage недоступен. */
let hiddenInMemory = false;

function wasHidden(): boolean {
  if (hiddenInMemory) return true;
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function hide(): void {
  hiddenInMemory = true;
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // Хранилище недоступно — хватит флага в памяти
  }
}

export function OwnLinkBanner({ placeId }: { placeId: number }) {
  const navigate = useNavigate();
  const reduced = useReduced();
  const ownLink = (useLocation().state as OwnLinkState | null)?.ownLink === true;
  const [shown, setShown] = useState(() => ownLink && !wasHidden());

  const viewAsStudent = () => {
    haptic.selection();
    // Тот же переход, что у сканера в колоде: место глазами студента поверх кандидатов, «Назад» — обратно к ним
    navigate(`/internships/${placeId}`, { state: { asStudent: true } satisfies AsStudentState });
  };

  const close = () => {
    haptic.selection();
    hide();
    setShown(false);
  };

  return (
    <AnimatePresence>
      {shown && (
        <motion.section
          key="own-link"
          className="surf cd-own"
          aria-label="Ссылка на своё место"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0, transition: fade } : { opacity: 0, y: -8 }}
          transition={reduced ? fade : spring}
        >
          <span className="cd-own-ic" aria-hidden="true">
            <QrIcon />
          </span>
          <span className="cd-own-t">Вы открыли ссылку на своё место</span>
          <button type="button" className="btn sec sm cd-own-go" onClick={viewAsStudent}>
            Посмотреть как студент
          </button>
          <button type="button" className="cd-own-x" aria-label="Закрыть подсказку" onClick={close}>
            <CrossIcon className="ic sm" />
          </button>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
