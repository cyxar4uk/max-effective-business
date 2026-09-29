import { AnimatePresence, motion } from 'motion/react';
import { fade, spring, useReduced } from '../../motion/springs';
import type { ScanProblem } from './useScanPlace';
import { Icon } from './ui';

const TEXT: Record<ScanProblem, { title: string; text: string; retry: string | null }> = {
  foreign: {
    title: 'Это не QR-код места «Тандема»',
    text: 'Наведите камеру на код с плаката на стенде компании.',
    retry: 'Сканировать ещё раз',
  },
  failed: {
    title: 'Не получилось открыть сканер',
    text: 'Разрешите MAX доступ к камере или выберите фото QR-кода из галереи.',
    retry: 'Попробовать ещё раз',
  },
  outside: {
    title: 'Сканер работает в MAX',
    text: 'Откройте «Тандем» в приложении MAX и наведите камеру на QR-код на стенде компании.',
    retry: null,
  },
};

interface ScanNoticeProps {
  problem: ScanProblem | null;
  onRetry: () => void;
  onClose: () => void;
}

/** Что не так со сканированием и что делать: всплывает снизу, «Сканировать ещё раз» открывает сканер снова. */
export function ScanNotice({ problem, onRetry, onClose }: ScanNoticeProps) {
  const reduced = useReduced();
  const t = problem ? TEXT[problem] : null;
  return (
    <AnimatePresence>
      {problem && t && (
        <motion.div
          key={problem}
          className="scan-notice"
          role={problem === 'outside' ? 'status' : 'alert'}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={reduced ? fade : spring}
        >
          <span className={problem === 'outside' ? 'scan-ic' : 'scan-ic err'} aria-hidden="true">
            <Icon name="qr" size="sm" />
          </span>
          <span className="col grow">
            <span className="scan-t">{t.title}</span>
            <span className="lbl">{t.text}</span>
            {t.retry && (
              <button type="button" className="btn sm pri scan-retry" onClick={onRetry}>
                {t.retry}
              </button>
            )}
          </span>
          <button type="button" className="scan-x" aria-label="Закрыть" onClick={onClose}>
            <Icon name="cross" size="sm" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
