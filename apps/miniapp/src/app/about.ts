// Содержимое «О сервисе», которое не выводится из кода: документы, реквизиты, поддержка.
// Требование модерации MAX (docs/05_max_platform.md): ссылки на соглашение, политику, реквизиты и поддержку.
// Заполняет Артём. Пустой список или null — блок на экране не показывается.

export interface AboutLink {
  title: string;
  /** Полный адрес или путь к файлу в apps/miniapp/public (например, /legal/privacy.html). */
  url: string;
}

export interface AboutContent {
  /** Ник бота: ссылка на чат, где приходят уведомления. */
  botNick: string;
  /** Пользовательское соглашение, политика конфиденциальности, согласие на обработку ПД. */
  documents: AboutLink[];
  /** Строки реквизитов: «ИП …», «ИНН …», «ОГРНИП …». */
  requisites: string[];
  /** Контакт поддержки, например { title: 'support@…', url: 'mailto:support@…' }. */
  support: AboutLink | null;
}

export const ABOUT: AboutContent = {
  botNick: 't373_hakaton_max_bot',
  documents: [],
  requisites: [],
  support: null,
};
