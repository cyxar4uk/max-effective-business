// Сканер QR-кода места на ярмарке: openCodeReader (камера или фото из галереи) → разбор диплинка → экран места.
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { AsStudentState } from '../../app/launchState';
import { placeIdFromScan } from '../../app/placeLink';
import { haptic, insideMax, openCodeReader } from '../../max/bridge';

/** Что пошло не так: чужой код, сканер не открылся, приложение открыто не в MAX. */
export type ScanProblem = 'foreign' | 'failed' | 'outside';

/**
 * Пользователь сам закрыл сканер или не навёл камеру. Коды ошибок сканера в документации MAX не описаны, формат
 * ошибок клиента — `{ error: { code } }`: закрытие и таймаут (`client.open_code_reader.request_timeout`)
 * распознаём по словам в коде, пустой отказ считаем закрытием.
 */
function isCancel(err: unknown): boolean {
  if (err === undefined || err === null) return true;
  const code = (err as { error?: { code?: unknown } }).error?.code;
  return typeof code === 'string' && /cancel|close|dismiss|abort|timeout/i.test(code);
}

export function useScanPlace() {
  const navigate = useNavigate();
  const [problem, setProblem] = useState<ScanProblem | null>(null);
  // Номер последнего вызова: ответ старого вызова (клиент мог держать его до таймаута) не мешает новому скану
  const seq = useRef(0);

  /** Вызывать прямо из нажатия: сканер открывается по действию пользователя. */
  const scan = useCallback(() => {
    if (!insideMax) {
      setProblem('outside');
      return;
    }
    const n = ++seq.current;
    setProblem(null);
    openCodeReader(true).then(
      (raw: unknown) => {
        if (n !== seq.current) return;
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
        navigate(`/internships/${id}`, { state: { asStudent: true } satisfies AsStudentState });
      },
      (err: unknown) => {
        if (n !== seq.current || isCancel(err)) return;
        haptic.notify('error');
        setProblem('failed');
      },
    );
  }, [navigate]);

  const dismiss = useCallback(() => setProblem(null), []);

  return { scan, problem, dismiss };
}
