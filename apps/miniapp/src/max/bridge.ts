// Обёртка над MAX Bridge (window.WebApp). Скрипт подключён в index.html.
// Только то, что описано в docs/05_max_platform.md и https://dev.max.ru/docs/webapps/bridge — ничего не выдумываем.

export type MaxPlatform = 'ios' | 'android' | 'desktop' | 'web';
export type ImpactStyle = 'soft' | 'light' | 'medium' | 'heavy' | 'rigid';
export type NotificationType = 'error' | 'success' | 'warning';

/** Результат requestContact(): этот объект целиком уходит в POST /api/me/phone. */
export interface MaxContact {
  phone: string;
  authDate: string;
  hash: string;
}

export type ShareParams = { text?: string; link?: string } | { mid: string; chatType: 'DIALOG' | 'CHAT' };

interface MaxInitDataUnsafe {
  query_id?: string;
  auth_date?: number;
  hash?: string;
  user?: { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string; photo_url?: string };
  chat?: { id: number; type: 'DIALOG' | 'CHAT' | 'CHANNEL' };
  start_param?: string;
}

interface MaxWebApp {
  initData: string;
  initDataUnsafe: MaxInitDataUnsafe;
  platform: MaxPlatform;
  version: string;
  ready?: () => void;
  BackButton: {
    isVisible: boolean;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  HapticFeedback: {
    impactOccurred(style: ImpactStyle, disableVibrationFallback?: boolean): void;
    notificationOccurred(type: NotificationType, disableVibrationFallback?: boolean): void;
    selectionChanged(disableVibrationFallback?: boolean): void;
  };
  requestContact(): Promise<MaxContact>;
  openCodeReader(fileSelect?: boolean): Promise<string>;
  shareMaxContent(params: ShareParams): unknown;
  openMaxLink(url: string): void;
  openLink(url: string): void;
}

declare global {
  interface Window {
    WebApp?: MaxWebApp;
  }
}

const webApp = (): MaxWebApp | undefined => window.WebApp;

/** Строка для X-Max-Init-Data. Вне MAX и только в `npm run dev` — из VITE_DEV_INIT_DATA (см. .env.example). */
function resolveInitData(): string {
  const fromMax = webApp()?.initData ?? '';
  if (fromMax) return fromMax;
  // Ветка вырезается из прод-сборки: import.meta.env.DEV там заменяется на false
  if (import.meta.env.DEV) return import.meta.env.VITE_DEV_INIT_DATA ?? '';
  return '';
}

export const initData: string = resolveInitData();

/** Приложение открыто внутри MAX (есть подписанные данные запуска от клиента). */
export const insideMax: boolean = Boolean(webApp()?.initData);

/** Bridge для действий, которые имеют смысл только в клиенте MAX (в обычном браузере скрипт тоже есть, но пустой). */
const maxApp = (): MaxWebApp | undefined => (insideMax ? webApp() : undefined);

/** Параметр запуска: `student` | `employer` | `internship_<id>` | пусто. */
export function getStartParam(): string {
  const fromMax = webApp()?.initDataUnsafe?.start_param;
  if (fromMax) return fromMax;
  // Вне MAX initDataUnsafe пустой — берём start_param из той же dev-строки
  if (import.meta.env.DEV && initData) return new URLSearchParams(initData).get('start_param') ?? '';
  return '';
}

export const platform = (): MaxPlatform | undefined => webApp()?.platform;

/** Сообщить MAX, что приложение готово. Вызывается один раз при старте. */
export function ready(): void {
  webApp()?.ready?.();
}

export const backButton = {
  show: () => webApp()?.BackButton.show(),
  hide: () => webApp()?.BackButton.hide(),
  onClick: (cb: () => void) => webApp()?.BackButton.onClick(cb),
  offClick: (cb: () => void) => webApp()?.BackButton.offClick(cb),
};

/** Тактильный отклик — только в клиенте MAX; отказ клиента (в том числе вне MAX) молча игнорируем. */
function feel(call: (app: MaxWebApp) => unknown): void {
  const app = maxApp();
  if (!app) return;
  try {
    void Promise.resolve(call(app)).catch(() => undefined);
  } catch {
    // клиент без поддержки тактильного отклика
  }
}

export const haptic = {
  impact: (style: ImpactStyle = 'light') => feel((app) => app.HapticFeedback.impactOccurred(style)),
  notify: (type: NotificationType) => feel((app) => app.HapticFeedback.notificationOccurred(type)),
  selection: () => feel((app) => app.HapticFeedback.selectionChanged()),
};

/**
 * Номер телефона через модальное окно MAX. Отказ пользователя — ошибка
 * `{ error: { code: 'client.request_phone.user_refused_provide_phone_number' } }`: в этом случае API не вызываем.
 */
export function requestContact(): Promise<MaxContact> {
  const app = maxApp();
  if (!app) return Promise.reject(new Error('Запросить номер можно только в MAX'));
  return app.requestContact();
}

/** Сканер QR: камера или файл. Возвращает строку из кода. */
export function openCodeReader(fileSelect = true): Promise<string> {
  const app = maxApp();
  if (!app) return Promise.reject(new Error('Сканер доступен только в MAX'));
  return app.openCodeReader(fileSelect);
}

export function shareMaxContent(params: ShareParams): void {
  maxApp()?.shareMaxContent(params);
}

/** Диплинк MAX (https://max.ru/…). Вне MAX — обычный переход. */
export function openMaxLink(url: string): void {
  const app = maxApp();
  if (app) app.openMaxLink(url);
  else window.open(url, '_blank', 'noopener');
}

/** Внешняя ссылка. Вне MAX — новая вкладка. */
export function openLink(url: string): void {
  const app = maxApp();
  if (app) app.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

/**
 * Документ или внешняя страница по нажатию: в MAX — во внешнем браузере (openLink), вне MAX — в новой вкладке.
 * Путь из public (например, /legal/terms.html) дополняем доменом мини-приложения: openLink нужен полный адрес.
 * Вызывать прямо в обработчике нажатия: MAX открывает ссылку только по клику пользователя.
 */
export function openPage(url: string): void {
  openLink(new URL(url, window.location.origin).href);
}
