export const FLASH_EVENT = 'tandem:flash';

/** Подтверждение успеха, которое переживает переход: «Анкета сохранена» видно уже на экране, куда вернулись (FlashHost). */
export function flash(text: string): void {
  window.dispatchEvent(new CustomEvent<string>(FLASH_EVENT, { detail: text }));
}
