// Содержимое «О сервисе», которое не выводится из кода: документы, реквизиты, поддержка.
// Требование модерации MAX (docs/05_max_platform.md): ссылки на соглашение, политику, реквизиты и поддержку.
// Пустой список или null — блок на экране не показывается.

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

/**
 * Черновики документов для хакатона — статичные страницы в public/legal/.
 * Текст согласия соответствует версии CONSENT_VERSION = '2026-09-27' (api/client.ts и сервер): поменяли смысл
 * согласия — меняем версию и там, и там.
 */
export const LEGAL = {
  terms: { title: 'Пользовательское соглашение', url: '/legal/terms.html' },
  privacy: { title: 'Политика обработки персональных данных', url: '/legal/privacy.html' },
  consent: { title: 'Согласие на обработку персональных данных', url: '/legal/consent.html' },
} satisfies Record<string, AboutLink>;

export const ABOUT: AboutContent = {
  botNick: 't373_hakaton_max_bot',
  documents: [LEGAL.terms, LEGAL.privacy, LEGAL.consent],
  // Реквизитов у команды хакатона нет — блок скрыт
  requisites: [],
  support: { title: 'i.r.melnikov@gmail.com', url: 'mailto:i.r.melnikov@gmail.com' },
};
