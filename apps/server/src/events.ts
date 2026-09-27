import { EventEmitter } from 'node:events';
import type { Logger } from 'pino';

// Внутренние события сервера. API публикует их после успешной записи в БД,
// модуль bot подписывается. Бот ничего не знает про HTTP, API — про MAX Bot API.
// В событиях только идентификаторы: подписчик сам читает актуальные данные из БД.
export interface AppEvents {
  'internship.created': { internshipId: number };
  'interest.created': { interestId: number; internshipId: number; studentUserId: number; status: 'interested' | 'skipped' };
  'interest.invited': { interestId: number; internshipId: number; studentUserId: number };
}

export type EventName = keyof AppEvents;
type Handler<K extends EventName> = (payload: AppEvents[K]) => void | Promise<void>;

export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor(private readonly log: Logger) {}

  // Ошибка подписчика логируется и не доходит до публикующего запроса
  on<K extends EventName>(name: K, handler: Handler<K>): void {
    this.emitter.on(name, (payload: AppEvents[K]) => {
      Promise.resolve()
        .then(() => handler(payload))
        .catch((err: unknown) => this.log.error({ err, event: name }, 'Ошибка обработчика события'));
    });
  }

  emit<K extends EventName>(name: K, payload: AppEvents[K]): void {
    this.emitter.emit(name, payload);
  }
}
