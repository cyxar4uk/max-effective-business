// ИИ по делу: черновик карточки места для работодателя (GigaChat). В подбор и процент совпадения ИИ не входит.
import type { Logger } from 'pino';
import type { Config } from '../config.js';
import { createGigaChat, GigaChatError, type GigaChat } from './gigachat.js';
import { createPlaceDrafter, DRAFT_MAX_IN_FLIGHT, type PlaceDrafter } from './placeDraft.js';

export type { PlaceDrafter } from './placeDraft.js';
export type { PlaceDraft } from './types.js';
export { DRAFT_LIMITS } from './types.js';

export function createDrafterFromConfig(
  config: Pick<Config, 'GIGACHAT_AUTH_KEY' | 'GIGACHAT_SCOPE' | 'GIGACHAT_MODEL'>,
  log: Logger,
): PlaceDrafter {
  const ai = config.GIGACHAT_AUTH_KEY
    ? createGigaChat({ authKey: config.GIGACHAT_AUTH_KEY, scope: config.GIGACHAT_SCOPE, model: config.GIGACHAT_MODEL })
    : null;
  log.info({ gigachat: ai ? config.GIGACHAT_MODEL : 'выключен' }, 'ИИ-черновик места');
  if (ai) void checkGigaChat(ai, config.GIGACHAT_MODEL, log);
  // У физлица GigaChat выполняет один запрос за раз, параллельный получает 429: остальные ждут в очереди
  const maxInFlight = config.GIGACHAT_SCOPE === 'GIGACHAT_API_PERS' ? 1 : DRAFT_MAX_IN_FLIGHT;
  return createPlaceDrafter({ ai, log, maxInFlight });
}

/**
 * Проверка при старте: принят ли ключ и есть ли модель. Мёртвый ключ видно в логе сразу после выкатки,
 * а не когда работодатель нажмёт «Заполнить за меня». Никогда не бросает: без модели черновик идёт по ключевым словам.
 */
export async function checkGigaChat(ai: GigaChat, model: string, log: Logger, timeoutMs = 15_000): Promise<boolean> {
  try {
    const models = await ai.models(AbortSignal.timeout(timeoutMs));
    if (models.includes(model)) {
      log.info({ model }, 'GigaChat: ключ принят, модель доступна');
      return true;
    }
    log.warn({ model, available: models }, 'GigaChat: ключ принят, но модели нет в списке — проверьте GIGACHAT_MODEL');
    return false;
  } catch (err) {
    const e = err instanceof GigaChatError ? { status: err.status, stage: err.stage, reason: err.message } : { reason: err instanceof Error ? err.name : 'unknown' };
    log.warn(e, 'GigaChat: ключ не проверен — черновики пойдут по ключевым словам');
    return false;
  }
}
