// ИИ по делу: черновик карточки места для работодателя (GigaChat). В подбор и процент совпадения ИИ не входит.
import type { Logger } from 'pino';
import type { Config } from '../config.js';
import { createGigaChat } from './gigachat.js';
import { createPlaceDrafter, type PlaceDrafter } from './placeDraft.js';

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
  return createPlaceDrafter({ ai, log });
}
