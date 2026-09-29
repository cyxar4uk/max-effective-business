// Сканер QR-кода места на ярмарке: openCodeReader (камера или фото из галереи) → разбор диплинка → экран места.
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { placeIdFromScan } from '../../app/placeLink';
import { haptic, insideMax, openCodeReader } from '../../max/bridge';

/** Что пошло не так: чужой код, сканер не открылся, приложение открыто не в MAX. */
export type ScanProblem = 'foreign' | 'failed' | 'outside';

/**
 * Пользователь сам закрыл сканер. Коды ошибок сканера в документации MAX не описаны, формат ошибок клиента —
 * `{ error: { code } }`: закрытие распознаём по словам в коде, пустой отказ считаем закрытием.
 */
function isCancel(err: unknown): boolean {
  if (err === undefined || err === null) return true;
  const code = (err as { error?: { code?: unknown } }).error?.code;
  return typeof code === 'string' && /cancel|close|dismiss|abort/i.test(code);
}

export function useScanPlace() {
  const navigate = useNavigate();
  const [problem, setProblem] = useState<ScanProblem | null>(null);
  const open = useRef(false);

  /** Вызывать прямо из нажатия: сканер открывается по действию пользователя. */
  const scan = useCallback(() => {
    if (!insideMax) {
      setProblem('outside');
      return;
    }
    if (open.current) return;
    open.current = true;
    setProblem(null);
    openCodeReader(true)
      .then(
        (raw: unknown) => {
          // Пустой результат — сканер закрыли, ничего не показываем
          if (raw === undefined || raw === null || raw === '') return;
          const id = placeIdFromScan(raw);
          if (id === null) {
            haptic.notify('error');
            setProblem('foreign');
            return;
          }
          haptic.notify('success');
          // Смотрим глазами студента, даже если это своё место (проверка обеих ролей одним аккаунтом)
          navigate(`/internships/${id}`, { state: { asStudent: true } });
        },
        (err: unknown) => {
          if (isCancel(err)) return;
          haptic.notify('error');
          setProblem('failed');
        },
      )
      .finally(() => {
        open.current = false;
      });
  }, [navigate]);

  const dismiss = useCallback(() => setProblem(null), []);

  return { scan, problem, dismiss };
}
