// Демо-данные: вымышленные работодатели, стажировки и студенты. Всё помечается is_demo = true, стажировки — source = 'demo'.
// План и правила — team/timur/seed_plan.md. Навыки студентов подобраны «лесенкой» под стажировки своего направления,
// чтобы у каждой стажировки были кандидаты с разным процентом (проверяет src/seed/demo.test.ts).
//
// Телефоны заведомо несуществующие: код 000 в российской нумерации не используется.
// max_user_id отрицательные, чтобы не пересечься с настоящими пользователями MAX.
import type { PlaceType } from '../../db/entities.js';
import type { WorkFormat } from '../../matching/index.js';

/**
 * Реквизиты для документов практики (F-16, #144) — вымышленные и помеченные «тестовые», чтобы в демо договор
 * и письмо скачивались заполненными. Названия полей — как столбцы `employers` в спеке F-16.
 */
export interface DemoRequisites {
  legalName: string;
  inn: string;
  ogrn: string;
  legalAddress: string;
  signerName: string;
  signerPosition: string;
  signerBasis: string;
  responsibleName: string;
  responsiblePosition: string;
  responsiblePhone: string;
  responsibleEmail: string;
}

export interface DemoEmployer {
  key: string;
  maxUserId: number;
  companyName: string;
  city: string;
  contactFirstName: string;
  contactLastName: string;
  phone: string;
  requisites: DemoRequisites;
}

const ZIP: Record<string, string> = { Москва: '101000', Казань: '420000' };

/**
 * Тестовые реквизиты: ИНН и ОГРН с кодом региона 00 — такого региона нет, с настоящей компанией не совпадут.
 * ИНН — 10 цифр, ОГРН — 13 (как у юрлица), почта — на зарезервированном домене example.com.
 */
function demoRequisites(n: number, key: string, companyName: string, first: string, last: string, city: string, phone: string): DemoRequisites {
  const brand = /«([^»]+)»/.exec(companyName)?.[1] ?? companyName;
  return {
    legalName: `Общество с ограниченной ответственностью «${brand}» (тестовые реквизиты)`,
    inn: `00${String(n).padStart(8, '0')}`,
    ogrn: `12600${String(n).padStart(8, '0')}`,
    legalAddress: `${ZIP[city] ?? '000000'}, г. ${city}, ул. Тестовая, д. ${n} (тестовый адрес)`,
    signerName: `${last} ${first}`,
    signerPosition: 'генеральный директор',
    signerBasis: 'Устава',
    responsibleName: `${last} ${first}`,
    responsiblePosition: 'руководитель практики',
    responsiblePhone: phone,
    responsibleEmail: `practice-${key}@example.com`,
  };
}

export interface DemoInternship {
  /** Стабильный ключ, пишется в internships.source_id как `demo_<key>`. */
  key: string;
  employer: string;
  title: string;
  description: string;
  requiredSkills: string[];
  niceSkills: string[];
  format: WorkFormat;
  city: string | null;
  startsOn: string;
  endsOn: string;
  slots: number;
  type: PlaceType;
  paid: boolean;
  /** ₽ в месяц; только у оплачиваемых. null у оплачиваемого — «Оплачивается», сумма обсуждается на встрече. */
  salary: number | null;
  /**
   * Набор уже закрыт: места нет в ленте и в подборе. Отклик на него по прямой ссылке (`internship_<id>`, id —
   * `SELECT id FROM internships WHERE source_id = 'demo_<key>'`) получает ответ «Набор на это место закрыт».
   */
  closed?: boolean;
}

export interface DemoStudent {
  key: string;
  maxUserId: number;
  firstName: string;
  lastName: string;
  phone: string;
  university: string;
  faculty: string;
  course: number;
  direction: string;
  city: string;
  formats: WorkFormat[];
  skills: string[];
}

const MSK = 'Москва';
const KZN = 'Казань';
const UNI = 'РАНХиГС';

const employer = (
  n: number,
  key: string,
  companyName: string,
  contactFirstName: string,
  contactLastName: string,
  city: string = MSK,
): DemoEmployer => ({
  key,
  maxUserId: -1000 - n,
  companyName,
  city,
  contactFirstName,
  contactLastName,
  phone: `+7000000${1000 + n}`,
  requisites: demoRequisites(n, key, companyName, contactFirstName, contactLastName, city, `+7000000${1000 + n}`),
});

export const DEMO_EMPLOYERS: DemoEmployer[] = [
  employer(1, 'luch', 'Цифровая мастерская «Луч»', 'Олег', 'Самойлов'),
  employer(2, 'sarafan', 'Агентство «Сарафан»', 'Марина', 'Голубева'),
  employer(3, 'saldo', 'Бюро «Сальдо и партнёры»', 'Ирина', 'Лаптева'),
  employer(4, 'st421', 'Юридическое бюро «Статья 421»', 'Павел', 'Родионов'),
  employer(5, 'zerna', 'Кофейни «Зёрна на углу»', 'Анна', 'Корнеева'),
  employer(6, 'marshrut', 'Логистика «Северный маршрут»', 'Денис', 'Широков'),
  employer(7, 'kirpich', 'Стройкомпания «Кирпичная линия»', 'Сергей', 'Абрамов'),
  employer(8, 'zal', 'Ивент-агентство «Громкий зал»', 'Вера', 'Соловьёва'),
  employer(9, 'vecher', 'Онлайн-школа «Учимся вечером»', 'Юлия', 'Тарасова'),
  employer(10, 'polka', 'Магазин «Полка у дома»', 'Артур', 'Гаврилов'),
  employer(11, 'processy', 'Консалтинг «Процессы и люди»', 'Наталья', 'Ефимова'),
  employer(12, 'kolos', 'Агрофирма «Тихий колос»', 'Михаил', 'Зуев'),
  // Казань (#99): финал проходит там, и проверяющий из Казани должен видеть очные места у себя
  employer(13, 'karavay', 'Пекарня «Утренний каравай»', 'Гульнара', 'Сабирова', KZN),
  employer(14, 'nitki', 'Магазин «Нитки и ткани» на маркетплейсах', 'Ильнур', 'Хасанов', KZN),
  employer(15, 'bauman', 'Бухгалтерское бюро «Баланс на Баумана»', 'Лилия', 'Гарипова', KZN),
  employer(16, 'kazanka', 'SMM-агентство «Казанка»', 'Динара', 'Мухаметова', KZN),
];

const autumn = { startsOn: '2026-10-19', endsOn: '2027-01-29' };

// Тип и оплата (#74). Все места — неполная занятость, 20 часов в неделю (см. описания), поэтому сумма считается
// от половины ставки: не ниже половины МРОТ 2026 (27 093 ₽ за полный месяц). Практика — без оплаты, как чаще всего
// бывает у малого бизнеса; стажировки — 20–35 тыс. ₽; подработок две.
const practice = { type: 'practice', paid: false, salary: null } as const;
const internship = (salary: number) => ({ type: 'internship', paid: true, salary }) as const;
const partTime = (salary: number) => ({ type: 'part_time', paid: true, salary }) as const;
const winter = { startsOn: '2026-11-09', endsOn: '2027-02-26' };
const spring = { startsOn: '2027-02-15', endsOn: '2027-05-28' };
// Условия для разнообразия (#99): оплачиваемое место без суммы — в карточке «Оплачивается», сумму называют на встрече;
// оплачиваемая практика — бывает и такое.
const paidNoSum = { type: 'internship', paid: true, salary: null } as const;
const paidPractice = (salary: number) => ({ type: 'practice', paid: true, salary }) as const;

export const DEMO_INTERNSHIPS: DemoInternship[] = [
  // Аналитика
  { key: 'a1', employer: 'polka', title: 'Стажёр-аналитик продаж', description: 'Собирать отчёты по продажам интернет-магазина, искать причины просадок, готовить еженедельную сводку для владельца. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['excel', 'sql'], niceSkills: ['power_bi', 'statistics'], format: 'remote', city: null, ...autumn, slots: 2, ...internship(30000) },
  { key: 'a2', employer: 'luch', title: 'Аналитик данных', description: 'Выгрузки и расчёты для клиентских проектов студии: воронки, когорты, простые модели на Python. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['sql', 'python'], niceSkills: ['data_visualization', 'statistics'], format: 'hybrid', city: MSK, ...autumn, slots: 1, ...internship(35000) },
  { key: 'a3', employer: 'sarafan', title: 'Помощник аналитика маркетинга', description: 'Считать результаты рекламных кампаний клиентов агентства и готовить отчёты в таблицах. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['excel', 'web_analytics'], niceSkills: ['google_sheets', 'market_research'], format: 'office', city: MSK, ...winter, slots: 1, ...practice },
  { key: 'a4', employer: 'marshrut', title: 'Стажёр по отчётности', description: 'Вести таблицы рейсов и загрузки машин, сверять данные водителей и склада. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['excel', 'google_sheets'], niceSkills: ['power_bi'], format: 'remote', city: null, ...autumn, slots: 2, ...internship(25000) },
  { key: 'a5', employer: 'kolos', title: 'Аналитик рынка зерна', description: 'Мониторинг цен и спроса на зерно по регионам, еженедельная справка для руководства. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['excel', 'market_research'], niceSkills: ['statistics', 'agronomy'], format: 'remote', city: null, ...winter, slots: 1, ...practice },
  // Маркетинг и PR
  { key: 'm1', employer: 'zerna', title: 'SMM-стажёр', description: 'Вести соцсети сети кофеен: контент-план, тексты, фото и короткие видео из заведений. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['smm', 'copywriting'], niceSkills: ['photoshop', 'video_editing'], format: 'hybrid', city: MSK, ...autumn, slots: 1, ...internship(25000) },
  { key: 'm2', employer: 'vecher', title: 'Стажёр контент-маркетинга', description: 'Статьи и рассылки для онлайн-школы, работа с редактором и SEO-специалистом. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['copywriting', 'content_marketing'], niceSkills: ['seo', 'smm'], format: 'remote', city: null, ...autumn, slots: 2, ...internship(22000) },
  { key: 'm3', employer: 'sarafan', title: 'Стажёр по таргетированной рекламе', description: 'Настройка и ведение рекламных кампаний клиентов агентства под присмотром наставника. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['targeted_ads', 'web_analytics'], niceSkills: ['smm', 'excel'], format: 'remote', city: null, ...winter, slots: 1, ...internship(30000) },
  { key: 'm4', employer: 'zal', title: 'Помощник ивент-менеджера', description: 'Подготовка городских мероприятий: подрядчики, площадки, списки гостей, работа на площадке в день события. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['event_management', 'negotiations'], niceSkills: ['pr', 'smm'], format: 'office', city: MSK, ...autumn, slots: 2, ...partTime(20000) },
  { key: 'm5', employer: 'zal', title: 'PR-стажёр', description: 'Пресс-релизы, общение с журналистами и партнёрами, подготовка спикеров к выступлениям. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['pr', 'copywriting'], niceSkills: ['public_speaking', 'smm'], format: 'hybrid', city: MSK, ...winter, slots: 1, ...practice },
  // Экономика и финансы
  { key: 'f1', employer: 'saldo', title: 'Стажёр-бухгалтер', description: 'Первичка, банковские выписки и отчётность малых компаний — клиентов бюро, в 1С. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['accounting', '1c_accounting'], niceSkills: ['tax_accounting', 'excel'], format: 'office', city: MSK, ...autumn, slots: 2, ...practice },
  { key: 'f2', employer: 'kirpich', title: 'Стажёр финансового аналитика', description: 'Анализ смет и платежей по объектам, помощь в подготовке бюджета на следующий год. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['financial_analysis', 'excel'], niceSkills: ['financial_modeling', 'budgeting'], format: 'hybrid', city: MSK, ...autumn, slots: 1, ...internship(35000) },
  { key: 'f3', employer: 'saldo', title: 'Стажёр по МСФО', description: 'Трансформация отчётности клиентов в МСФО, перевод документов с английского. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['ifrs', 'english_b2'], niceSkills: ['financial_analysis', 'excel'], format: 'remote', city: null, ...winter, slots: 1, ...internship(30000) },
  { key: 'f4', employer: 'kolos', title: 'Помощник экономиста', description: 'Планирование затрат на сезон, контроль исполнения бюджета по полям и технике. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['budgeting', 'excel'], niceSkills: ['1c_accounting'], format: 'office', city: MSK, ...winter, slots: 1, ...practice },
  // Право
  { key: 'l1', employer: 'st421', title: 'Помощник юриста', description: 'Проверка и подготовка договоров, правовые справки по гражданским спорам клиентов. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['contract_law', 'civil_law'], niceSkills: ['consultant_plus', 'business_writing'], format: 'office', city: MSK, ...autumn, slots: 2, ...practice },
  { key: 'l2', employer: 'kirpich', title: 'Стажёр-юрист по закупкам', description: 'Сопровождение участия в госзакупках: документы заявки, проверка контрактов. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['public_procurement', 'contract_law'], niceSkills: ['consultant_plus'], format: 'hybrid', city: MSK, ...autumn, slots: 1, ...internship(25000) },
  { key: 'l3', employer: 'st421', title: 'Стажёр корпоративной практики', description: 'Корпоративные документы клиентов: уставы, протоколы, сделки с долями. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['corporate_law', 'legal_research'], niceSkills: ['english_b2'], format: 'remote', city: null, ...winter, slots: 1, ...practice },
  { key: 'l4', employer: 'processy', title: 'Помощник по трудовому праву', description: 'Кадровые документы и консультации клиентов по трудовым вопросам. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['labor_law', 'hr_admin'], niceSkills: ['consultant_plus'], format: 'remote', city: null, ...winter, slots: 1, ...practice },
  // Управление, HR и продажи
  { key: 'h1', employer: 'processy', title: 'Стажёр-рекрутер', description: 'Поиск и первичный отбор кандидатов для клиентов, переписка и назначение интервью. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['recruiting', 'business_writing'], niceSkills: ['crm', 'negotiations'], format: 'remote', city: null, ...autumn, slots: 2, ...internship(25000) },
  { key: 'h2', employer: 'zerna', title: 'Помощник HR', description: 'Оформление сотрудников кофеен, ведение кадровых документов и графиков. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['hr_admin', 'records_management'], niceSkills: ['recruiting', 'excel'], format: 'office', city: MSK, ...autumn, slots: 1, ...practice },
  { key: 'h3', employer: 'processy', title: 'Стажёр проектного офиса', description: 'Описание процессов клиентов, планы проектов, подготовка встреч и презентаций. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['project_management', 'business_processes'], niceSkills: ['presentations', 'excel'], format: 'hybrid', city: MSK, ...winter, slots: 1, ...practice },
  { key: 'h4', employer: 'marshrut', title: 'Помощник менеджера по продажам', description: 'Работа с заявками корпоративных клиентов, ведение сделок в CRM. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['sales', 'crm'], niceSkills: ['b2b_sales', 'negotiations'], format: 'office', city: MSK, ...winter, slots: 2, ...partTime(30000) },
  // IT и дизайн
  { key: 'i1', employer: 'luch', title: 'Стажёр фронтенд-разработки', description: 'Вёрстка и доработка интерфейсов клиентских сайтов в команде студии. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['html_css', 'javascript'], niceSkills: ['react', 'git'], format: 'remote', city: null, ...autumn, slots: 2, ...internship(35000) },
  { key: 'i2', employer: 'luch', title: 'Стажёр-тестировщик', description: 'Ручное тестирование сайтов и приложений, заведение задач на ошибки. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['qa_testing', 'git'], niceSkills: ['sql', 'javascript'], format: 'hybrid', city: MSK, ...winter, slots: 1, ...internship(30000) },
  { key: 'i3', employer: 'vecher', title: 'Стажёр-дизайнер интерфейсов', description: 'Макеты страниц курсов и личного кабинета ученика в Figma. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['figma', 'ui_ux'], niceSkills: ['graphic_design', 'presentations'], format: 'remote', city: null, ...autumn, slots: 1, ...internship(25000) },
  { key: 'i4', employer: 'polka', title: 'Стажёр-дизайнер для соцсетей', description: 'Баннеры, карточки товаров и обложки для соцсетей магазина. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['graphic_design', 'photoshop'], niceSkills: ['figma', 'video_editing'], format: 'remote', city: null, ...winter, slots: 1, ...internship(20000) },
  // Задачи малого бизнеса: маркетплейсы и сайт (справочник от 28.09)
  { key: 'b1', employer: 'polka', title: 'Менеджер маркетплейсов', description: 'Карточки товаров магазина на Wildberries и Ozon: тексты, фото, цены, ответы на вопросы покупателей. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['marketplace_cards', 'wildberries'], niceSkills: ['ozon', 'product_photo', 'unit_economics'], format: 'remote', city: null, ...autumn, slots: 2, ...internship(30000) },
  { key: 'b2', employer: 'zerna', title: 'Помощник по сайту и рассылкам', description: 'Обновлять сайт сети кофеен на Tilda, собирать рассылки о новинках и акциях, отвечать на отзывы. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['no_code', 'email_marketing'], niceSkills: ['seo', 'canva', 'reviews_management'], format: 'remote', city: null, ...winter, slots: 1, ...internship(20000) },
  // Казань (#99): только очные и гибридные — ради них и заводили; на каждый тег задач малого бизнеса есть открытое место.
  // Новое дописываем в конец: на проде база уже засеяна, повторная загрузка добавит только новые ключи.
  { key: 'k1', employer: 'karavay', title: 'Помощник по соцсетям пекарни', description: 'Снимать, как печётся хлеб и эчпочмаки, писать посты и сторис, отвечать на комментарии во «ВКонтакте» и в Telegram. Съёмки утром, пока выпечка свежая. Неполная занятость — 20 часов в неделю: два утра в пекарне, остальное из дома.', requiredSkills: ['smm', 'copywriting'], niceSkills: ['canva', 'video_editing'], format: 'hybrid', city: KZN, ...autumn, slots: 1, ...paidNoSum },
  { key: 'k2', employer: 'karavay', title: 'Администратор заказов на торты', description: 'Принимать заказы на торты и банкетную выпечку по телефону и в мессенджерах, вести их в CRM, напоминать гостям, когда заказ готов. Практика с оплатой. Неполная занятость — 20 часов в неделю, смены по будням.', requiredSkills: ['sales', 'customer_support'], niceSkills: ['crm', 'avito'], format: 'office', city: KZN, ...autumn, slots: 2, ...paidPractice(15000) },
  { key: 'k3', employer: 'nitki', title: 'Менеджер карточек на Wildberries и Ozon', description: 'Магазин тканей и фурнитуры для рукоделия: заводить и обновлять карточки, следить за остатками и ценами, разбирать отзывы. Раз в неделю — на склад, снимать новинки. Неполная занятость — 20 часов в неделю.', requiredSkills: ['marketplace_cards', 'wildberries'], niceSkills: ['ozon', 'product_photo', 'unit_economics'], format: 'hybrid', city: KZN, ...autumn, slots: 2, ...internship(30000) },
  { key: 'k4', employer: 'nitki', title: 'Помощник по сайту магазина', description: 'Весной запускаем свой сайт, чтобы не зависеть от одних маркетплейсов: собрать его на Tilda или WordPress, перенести каталог, подключить Метрику, нарисовать баннеры. Начинаем в феврале, после сессии. 15 часов в неделю, встречи в офисе по пятницам.', requiredSkills: ['no_code', 'wordpress'], niceSkills: ['seo', 'html_css', 'web_analytics', 'canva'], format: 'hybrid', city: KZN, ...spring, slots: 1, ...practice },
  { key: 'k5', employer: 'nitki', title: 'Стажёр по аналитике продаж', description: 'Свести продажи с Wildberries и Ozon в одну таблицу и понять, какие ткани приносят деньги, а какие лежат на складе. Раз в неделю — короткая сводка для владельца. Неполная занятость — 20 часов в неделю, в офисе.', requiredSkills: ['excel', 'google_sheets'], niceSkills: ['data_visualization', 'unit_economics'], format: 'office', city: KZN, ...autumn, slots: 1, ...internship(28000) },
  { key: 'k6', employer: 'bauman', title: 'Стажёр-бухгалтер в 1С', description: 'Первичка, банк и сверки в 1С для кафе и магазинов — клиентов бюро. Рядом всегда опытный бухгалтер, засчитываем как производственную практику. Неполная занятость — 20 часов в неделю, офис на Баумана.', requiredSkills: ['1c_accounting', 'accounting'], niceSkills: ['1c_trade', 'tax_accounting'], format: 'office', city: KZN, ...autumn, slots: 2, ...practice },
  { key: 'k7', employer: 'bauman', title: 'Помощник бухгалтера на годовой отчёт', description: 'Разнести документы за год в 1С и сверить остатки к сдаче годовой отчётности. Набор закрыт. Неполная занятость — 20 часов в неделю, офис на Баумана.', requiredSkills: ['1c_accounting', 'excel'], niceSkills: ['accounting'], format: 'office', city: KZN, ...winter, slots: 2, ...internship(25000), closed: true },
  { key: 'k8', employer: 'kazanka', title: 'Стажёр по таргетированной рекламе', description: 'Запускать рекламу во «ВКонтакте» для кофеен, салонов и шоурумов Казани, собирать креативы и разбирать, что сработало. Наставник — ведущий таргетолог агентства. Неполная занятость — 20 часов в неделю, планёрки в офисе по вторникам.', requiredSkills: ['targeted_ads', 'smm'], niceSkills: ['copywriting', 'canva', 'web_analytics'], format: 'hybrid', city: KZN, ...autumn, slots: 1, ...paidNoSum },
];

const ALL: WorkFormat[] = ['office', 'hybrid', 'remote'];

const student = (
  n: number,
  firstName: string,
  lastName: string,
  course: number,
  direction: string,
  faculty: string,
  skills: string[],
  where: { city?: string; formats?: WorkFormat[]; university?: string } = {},
): DemoStudent => ({
  key: `s${n}`,
  maxUserId: -2000 - n,
  firstName,
  lastName,
  phone: `+7000000${2000 + n}`,
  university: where.university ?? UNI,
  faculty,
  course,
  direction,
  city: where.city ?? MSK,
  formats: where.formats ?? ALL,
  skills,
});

const IEF = 'Институт экономики и финансов';
const IOM = 'Институт отраслевого менеджмента';
const IGS = 'Институт государственной службы и управления';
const ILAW = 'Юридический факультет';
const IBDA = 'Институт бизнеса и делового администрирования';
const OFFLINE: WorkFormat[] = ['office', 'hybrid'];
// Казань (#99)
const KFU = { university: 'КФУ', city: KZN };
const KAI = { university: 'КНИТУ-КАИ', city: KZN };
const KGEU = { university: 'КГЭУ', city: KZN };
const KFU_IUEF = 'Институт управления, экономики и финансов';
const KFU_JOUR = 'Высшая школа журналистики и медиакоммуникаций';
const KFU_ITIS = 'Институт информационных технологий и интеллектуальных систем';
const KAI_ECON = 'Институт экономики, управления и социальных технологий';
const KAI_IT = 'Институт компьютерных технологий и защиты информации';
const KGEU_DIG = 'Институт цифровых технологий и экономики';
// Москва, не РАНХиГС (#99)
const HSE = { university: 'ВШЭ' };
const MSU = { university: 'МГУ' };

export const DEMO_STUDENTS: DemoStudent[] = [
  // Аналитика
  student(1, 'Алина', 'Соколова', 4, 'Бизнес-информатика', IBDA, ['excel', 'sql', 'python', 'power_bi', 'statistics', 'data_visualization', 'google_sheets', 'web_analytics', 'market_research']),
  student(2, 'Максим', 'Орлов', 3, 'Экономика', IEF, ['excel', 'sql', 'power_bi', 'google_sheets', 'english_b1']),
  student(3, 'Дарья', 'Ковалёва', 2, 'Экономика', IEF, ['excel', 'google_sheets', 'market_research', 'presentations']),
  student(4, 'Илья', 'Фёдоров', 3, 'Прикладная информатика', IBDA, ['sql', 'python', 'git', 'english_b1']),
  student(5, 'Ксения', 'Белова', 2, 'Маркетинг', IBDA, ['excel', 'sql', 'smm', 'copywriting', 'marketplace_cards']),
  student(6, 'Роман', 'Жуков', 4, 'Бизнес-информатика', IBDA, ['excel', 'sql', 'power_bi', 'statistics'], { city: 'Санкт-Петербург', formats: ['office', 'hybrid'] }),
  // Маркетинг и PR
  student(7, 'Екатерина', 'Морозова', 4, 'Реклама и связи с общественностью', IOM, ['smm', 'copywriting', 'content_marketing', 'seo', 'photoshop', 'video_editing', 'pr', 'public_speaking']),
  student(8, 'Артём', 'Волков', 3, 'Маркетинг', IBDA, ['smm', 'copywriting', 'targeted_ads', 'web_analytics', 'excel', 'sales', 'crm', 'marketplace_cards', 'wildberries']),
  student(9, 'Полина', 'Никитина', 3, 'Реклама и связи с общественностью', IOM, ['event_management', 'negotiations', 'pr', 'smm', 'public_speaking']),
  student(10, 'Кирилл', 'Андреев', 2, 'Маркетинг', IBDA, ['copywriting', 'content_marketing', 'targeted_ads', 'web_analytics', 'no_code', 'email_marketing', 'canva']),
  student(11, 'Виктория', 'Лебедева', 2, 'Менеджмент', IOM, ['event_management', 'negotiations', 'copywriting', 'excel']),
  student(12, 'Тимофей', 'Козлов', 3, 'Реклама и связи с общественностью', IOM, ['smm', 'copywriting', 'targeted_ads'], { city: 'Казань', formats: ['office', 'hybrid'] }),
  // Экономика и финансы
  student(13, 'Анастасия', 'Павлова', 4, 'Экономика', IEF, ['accounting', '1c_accounting', 'tax_accounting', 'excel', 'financial_analysis', 'financial_modeling', 'budgeting']),
  student(14, 'Егор', 'Семёнов', 3, 'Экономика', IEF, ['accounting', '1c_accounting', 'excel']),
  student(15, 'Мария', 'Голованова', 4, 'Финансы и кредит', IEF, ['ifrs', 'english_b2', 'financial_analysis', 'excel']),
  student(16, 'Даниил', 'Егоров', 3, 'Финансы и кредит', IEF, ['financial_analysis', 'excel', 'budgeting']),
  student(17, 'Софья', 'Макарова', 2, 'Экономика', IEF, ['ifrs', 'english_b2', 'accounting', '1c_accounting']),
  student(18, 'Никита', 'Зайцев', 3, 'Экономика', IEF, ['accounting', '1c_accounting', 'excel', 'financial_analysis'], { city: 'Санкт-Петербург', formats: ['office'] }),
  // Право
  student(19, 'Елизавета', 'Васильева', 4, 'Юриспруденция', ILAW, ['contract_law', 'civil_law', 'consultant_plus', 'business_writing', 'public_procurement', 'corporate_law', 'legal_research']),
  student(20, 'Александр', 'Смирнов', 2, 'Юриспруденция', ILAW, ['contract_law', 'civil_law', 'public_speaking']),
  student(21, 'Валерия', 'Попова', 3, 'Юриспруденция', ILAW, ['corporate_law', 'legal_research', 'english_b2', 'contract_law']),
  student(22, 'Михаил', 'Кузнецов', 4, 'Юриспруденция', ILAW, ['labor_law', 'hr_admin', 'consultant_plus', 'civil_law']),
  student(23, 'Арина', 'Новикова', 3, 'Государственное и муниципальное управление', IGS, ['public_procurement', 'contract_law', 'records_management']),
  student(24, 'Глеб', 'Медведев', 2, 'Юриспруденция', ILAW, ['labor_law', 'hr_admin'], { city: 'Казань', formats: ['office', 'hybrid'] }),
  // Управление, HR и продажи
  student(25, 'Вероника', 'Алексеева', 4, 'Управление персоналом', IGS, ['recruiting', 'business_writing', 'crm', 'negotiations', 'hr_admin', 'records_management', 'excel']),
  student(26, 'Ярослава', 'Степанова', 3, 'Управление персоналом', IGS, ['hr_admin', 'records_management', 'labor_law']),
  student(27, 'Матвей', 'Григорьев', 4, 'Менеджмент', IOM, ['project_management', 'business_processes', 'presentations', 'excel']),
  student(28, 'Георгий', 'Воробьёв', 3, 'Менеджмент', IOM, ['sales', 'crm', 'b2b_sales', 'negotiations']),
  student(29, 'Ульяна', 'Фролова', 2, 'Управление персоналом', IGS, ['recruiting', 'business_writing', 'project_management', 'business_processes']),
  student(30, 'Лев', 'Романов', 3, 'Менеджмент', IOM, ['sales', 'crm', 'project_management', 'business_processes'], { city: 'Санкт-Петербург', formats: ['office', 'hybrid'] }),
  // IT и дизайн
  student(31, 'Станислав', 'Беляев', 4, 'Прикладная информатика', IBDA, ['html_css', 'javascript', 'react', 'git', 'qa_testing', 'sql', 'nodejs']),
  student(32, 'Милана', 'Тихонова', 2, 'Прикладная информатика', IBDA, ['html_css', 'javascript', 'graphic_design', 'photoshop', 'no_code', 'email_marketing']),
  student(33, 'Фёдор', 'Крылов', 3, 'Бизнес-информатика', IBDA, ['qa_testing', 'git', 'english_b1']),
  student(34, 'Алиса', 'Королёва', 4, 'Дизайн', IOM, ['figma', 'ui_ux', 'graphic_design', 'presentations', 'photoshop', 'video_editing']),
  student(35, 'Василиса', 'Мельникова', 2, 'Дизайн', IOM, ['figma', 'ui_ux']),
  student(36, 'Святослав', 'Гусев', 3, 'Дизайн', IOM, ['graphic_design', 'photoshop', 'html_css'], { formats: ['office'] }),
  // Не из Москвы, с ходовыми навыками и любым форматом: проверяющий из другого города (финал — в Казани)
  // публикует очную стажировку у себя и видит кандидатов
  student(37, 'Камила', 'Хайруллина', 3, 'Бизнес-информатика', IBDA, ['excel', 'google_sheets', 'sql', 'presentations', 'business_writing', 'no_code'], { city: 'Казань' }),
  student(38, 'Айдар', 'Сафин', 2, 'Маркетинг', IBDA, ['excel', 'smm', 'copywriting', 'content_marketing', 'photoshop', 'marketplace_cards', 'wildberries', 'ozon', 'product_photo'], { city: 'Казань' }),
  student(39, 'Регина', 'Галиева', 4, 'Экономика', IEF, ['excel', 'accounting', '1c_accounting', 'budgeting', 'english_b1'], { city: 'Казань' }),
  student(40, 'Олеся', 'Воронина', 3, 'Менеджмент', IOM, ['excel', 'sales', 'crm', 'negotiations', 'recruiting', 'business_writing'], { city: 'Санкт-Петербург' }),
  // Типовые задачи малого бизнеса (#64): Москва, любой формат. Проверяющий выбирает тег в форме — тег подставляет
  // свои навыки обязательными, — и на такое место сразу откликаются не меньше четырёх студентов, из них двое от 80 %
  // (проверяет src/seed/demo.test.ts). У каждого — сильная сторона в одном теге и частичная в другом.
  student(41, 'Диана', 'Шарова', 3, 'Маркетинг', IBDA, ['marketplace_cards', 'wildberries', 'ozon', 'product_photo', 'unit_economics', 'avito', 'customer_support', 'sales', 'excel']),
  student(42, 'Руслан', 'Ахметов', 4, 'Экономика', IEF, ['marketplace_cards', 'wildberries', 'ozon', 'unit_economics', '1c_trade', '1c_accounting', 'excel', 'google_sheets']),
  student(43, 'Злата', 'Кириллова', 2, 'Реклама и связи с общественностью', IOM, ['marketplace_cards', 'wildberries', 'product_photo', 'smm', 'copywriting', 'targeted_ads', 'canva']),
  student(44, 'Марк', 'Дорофеев', 3, 'Прикладная информатика', IBDA, ['no_code', 'wordpress', 'html_css', 'seo', 'figma', 'copywriting']),
  student(45, 'Ева', 'Субботина', 4, 'Бизнес-информатика', IBDA, ['no_code', 'wordpress', 'html_css', 'seo', 'email_marketing', 'web_analytics'], { formats: ['hybrid', 'remote'] }),
  student(46, 'Богдан', 'Ларин', 2, 'Реклама и связи с общественностью', IOM, ['no_code', 'wordpress', 'seo', 'canva', 'smm']),
  student(47, 'Таисия', 'Громова', 3, 'Экономика', IEF, ['excel', 'google_sheets', 'data_visualization', 'power_bi', 'sql', 'presentations']),
  student(48, 'Всеволод', 'Панин', 4, 'Экономика', IEF, ['1c_accounting', '1c_trade', '1c_programming', 'accounting', 'excel', 'google_sheets', 'power_bi']),
  student(49, 'Мирослава', 'Уварова', 3, 'Реклама и связи с общественностью', IOM, ['smm', 'copywriting', 'targeted_ads', 'canva', 'video_editing', 'content_marketing']),
  student(50, 'Тимур', 'Галимов', 3, 'Прикладная информатика', IBDA, ['1c_accounting', '1c_trade', '1c_programming', 'sql', 'git']),
  student(51, 'Нина', 'Осипова', 2, 'Бизнес-информатика', IBDA, ['1c_trade', '1c_programming', 'html_css', 'no_code', 'seo', 'excel']),
  student(52, 'Прохор', 'Ермаков', 2, 'Менеджмент', IOM, ['sales', 'crm', 'avito', 'customer_support', 'negotiations', 'marketplace_cards', 'wildberries', 'ozon']),
  // Казань (#99): та же «лесенка», что у s41–s52. На место проверяющего в Казани с любым тегом, очное или гибридное,
  // откликаются не меньше четырёх студентов, из них двое от 80 % и один с пробелами (проверяет src/seed/demo.test.ts).
  // Полный набор навыков тега — у двоих, частичный — ещё у двоих.
  student(53, 'Айгуль', 'Нуриева', 3, 'Реклама и связи с общественностью', KFU_JOUR, ['smm', 'copywriting', 'targeted_ads', 'canva', 'video_editing', 'content_marketing'], KFU),
  student(54, 'Булат', 'Зарипов', 4, 'Маркетинг', KFU_IUEF, ['no_code', 'wordpress', 'html_css', 'seo', 'web_analytics', 'smm', 'copywriting', 'canva'], { ...KFU, formats: OFFLINE }),
  student(55, 'Алсу', 'Мингазова', 2, 'Менеджмент', KGEU_DIG, ['smm', 'copywriting', 'targeted_ads', 'canva', 'sales', 'crm', 'avito', 'customer_support'], { ...KGEU, formats: OFFLINE }),
  student(56, 'Ринат', 'Валиев', 3, 'Экономика', KGEU_DIG, ['marketplace_cards', 'wildberries', 'ozon', 'unit_economics', 'excel', 'google_sheets', 'power_bi', '1c_accounting', '1c_trade'], KGEU),
  student(57, 'Эльвира', 'Шакирова', 2, 'Маркетинг', KFU_IUEF, ['marketplace_cards', 'wildberries', 'ozon', 'product_photo', 'unit_economics', 'avito', 'customer_support', 'sales'], { ...KFU, formats: OFFLINE }),
  student(58, 'Карина', 'Ибрагимова', 2, 'Менеджмент', KGEU_DIG, ['sales', 'crm', 'avito', 'marketplace_cards', 'wildberries', 'ozon', 'negotiations'], { ...KGEU, formats: OFFLINE }),
  student(59, 'Артур', 'Мусин', 4, 'Менеджмент', KAI_ECON, ['sales', 'crm', 'avito', 'customer_support', 'b2b_sales', 'negotiations', 'marketplace_cards', 'wildberries'], KAI),
  student(60, 'Ильдар', 'Хабибуллин', 3, 'Прикладная информатика', KAI_IT, ['1c_accounting', '1c_trade', '1c_programming', 'html_css', 'wordpress', 'no_code', 'seo', 'git'], { ...KAI, formats: OFFLINE }),
  student(61, 'Лейсан', 'Фаттахова', 4, 'Экономика', KGEU_DIG, ['1c_accounting', '1c_trade', '1c_programming', 'accounting', 'tax_accounting', 'excel'], { ...KGEU, formats: OFFLINE }),
  student(62, 'Диляра', 'Сафиуллина', 3, 'Экономика', KFU_IUEF, ['accounting', '1c_accounting', '1c_trade', 'excel', 'google_sheets', 'power_bi'], { ...KFU, formats: OFFLINE }),
  student(63, 'Айрат', 'Гилязов', 4, 'Бизнес-информатика', KFU_ITIS, ['excel', 'google_sheets', 'data_visualization', 'power_bi', 'sql', 'no_code', 'wordpress', 'seo'], KFU),
  student(64, 'Ангелина', 'Яковлева', 3, 'Бизнес-информатика', KAI_ECON, ['excel', 'google_sheets', 'data_visualization', 'power_bi', 'presentations', 'no_code', 'html_css', 'seo'], { ...KAI, formats: OFFLINE }),
  // Москва, ВШЭ и МГУ (#99): чтобы не все студенты были из одного вуза. Навыки подобраны так, чтобы не вытеснить
  // прежних студентов из откликов на старые места — на проде они уже есть (проверяет src/seed/demo.test.ts).
  student(65, 'Арсений', 'Котов', 2, 'Экономика', 'Факультет экономических наук', ['excel', 'google_sheets', 'presentations', 'english_b2'], HSE),
  student(66, 'Варвара', 'Лапина', 3, 'Медиакоммуникации', 'Факультет креативных индустрий', ['smm', 'copywriting', 'canva', 'targeted_ads'], HSE),
  student(67, 'Ян', 'Березин', 4, 'Прикладная математика и информатика', 'Факультет компьютерных наук', ['python', 'git', 'statistics', 'english_b2'], HSE),
  student(68, 'Ульяна', 'Сорокина', 3, 'Экономика', 'Экономический факультет', ['financial_analysis', 'excel', 'english_b1', 'presentations'], MSU),
  student(69, 'Тихон', 'Миронов', 2, 'Журналистика', 'Факультет журналистики', ['copywriting', 'content_marketing', 'pr'], { ...MSU, formats: ['remote'] }),
];

/** Стажировки, где у первого подходящего кандидата уже «приглашён», а у третьего — «отказ», чтобы в демо были видны все статусы. */
export const DEMO_INVITE_KEYS = ['a1', 'a3', 'm1', 'f1', 'f4', 'k3', 'k7'];
