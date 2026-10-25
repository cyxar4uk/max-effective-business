// Как скачать файл по подписанной ссылке внутри MAX. Отдельно от bridge.ts: тот при импорте читает window.WebApp.
import type { MaxPlatform } from './bridge';

/**
 * native — WebApp.downloadFile: файл качает нативный клиент MAX. link — openLink: ссылка открывается в браузере, и он
 * скачивает файл по Content-Disposition: attachment. downloadFile в веб-версии MAX не работает («в браузере метод не
 * работает», https://dev.max.ru/docs/webapps/bridge), а в старых клиентах его нет — тогда ссылка.
 */
export function downloadVia(platform: MaxPlatform | undefined, hasNative: boolean): 'native' | 'link' {
  return platform !== 'web' && hasNative ? 'native' : 'link';
}
