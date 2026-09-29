import { AnimatePresence, motion } from 'motion/react';
import { fade, spring, useReduced } from '../motion/springs';
import type { ToastValue } from './useToast';

/** Тост сверху экрана: сползает на 8 px и проявляется; при prefers-reduced-motion — только проявление. */
export function Toast({ toast }: { toast: ToastValue | null }) {
  const reduced = useReduced();
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.text}
          className={`toast ${toast.kind}`}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={reduced ? fade : spring}
        >
          {toast.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
