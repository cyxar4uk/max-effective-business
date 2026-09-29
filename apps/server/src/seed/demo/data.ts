// Демо-данные: вымышленные работодатели, стажировки и студенты. Всё помечается is_demo = true, стажировки — source = 'demo'.
// План и правила — team/timur/seed_plan.md. Навыки студентов подобраны «лесенкой» под стажировки своего направления,
// чтобы у каждой стажировки были кандидаты с разным процентом (проверяет src/seed/demo.test.ts).
//
// Телефоны заведомо несуществующие: код 000 в российской нумерации не используется.
// max_user_id отрицательные, чтобы не пересечься с настоящими пользователями MAX.
import type { WorkFormat } from '../../matching/index.js';

export interface DemoEmployer {
  key: string;
  maxUserId: number;
  companyName: string;
  city: string;
  contactFirstName: string;
  contactLastName: string;
  phone: string;
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
const UNI = 'РАНХиГС';

const employer = (n: number, key: string, companyName: string, contactFirstName: string, contactLastName: string): DemoEmployer => ({
  key,
  maxUserId: -1000 - n,
  companyName,
  city: MSK,
  contactFirstName,
  contactLastName,
  phone: `+7000000${1000 + n}`,
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
];

const autumn = { startsOn: '2026-10-19', endsOn: '2027-01-29' };
const winter = { startsOn: '2026-11-09', endsOn: '2027-02-26' };

export const DEMO_INTERNSHIPS: DemoInternship[] = [
  // Аналитика
  { key: 'a1', employer: 'polka', title: 'Стажёр-аналитик продаж', description: 'Собирать отчёты по продажам интернет-магазина, искать причины просадок, готовить еженедельную сводку для владельца. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['excel', 'sql'], niceSkills: ['power_bi', 'statistics'], format: 'remote', city: null, ...autumn, slots: 2 },
  { key: 'a2', employer: 'luch', title: 'Аналитик данных', description: 'Выгрузки и расчёты для клиентских проектов студии: воронки, когорты, простые модели на Python. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['sql', 'python'], niceSkills: ['data_visualization', 'statistics'], format: 'hybrid', city: MSK, ...autumn, slots: 1 },
  { key: 'a3', employer: 'sarafan', title: 'Помощник аналитика маркетинга', description: 'Считать результаты рекламных кампаний клиентов агентства и готовить отчёты в таблицах. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['excel', 'web_analytics'], niceSkills: ['google_sheets', 'market_research'], format: 'office', city: MSK, ...winter, slots: 1 },
  { key: 'a4', employer: 'marshrut', title: 'Стажёр по отчётности', description: 'Вести таблицы рейсов и загрузки машин, сверять данные водителей и склада. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['excel', 'google_sheets'], niceSkills: ['power_bi'], format: 'remote', city: null, ...autumn, slots: 2 },
  { key: 'a5', employer: 'kolos', title: 'Аналитик рынка зерна', description: 'Мониторинг цен и спроса на зерно по регионам, еженедельная справка для руководства. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['excel', 'market_research'], niceSkills: ['statistics', 'agronomy'], format: 'remote', city: null, ...winter, slots: 1 },
  // Маркетинг и PR
  { key: 'm1', employer: 'zerna', title: 'SMM-стажёр', description: 'Вести соцсети сети кофеен: контент-план, тексты, фото и короткие видео из заведений. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['smm', 'copywriting'], niceSkills: ['photoshop', 'video_editing'], format: 'hybrid', city: MSK, ...autumn, slots: 1 },
  { key: 'm2', employer: 'vecher', title: 'Стажёр контент-маркетинга', description: 'Статьи и рассылки для онлайн-школы, работа с редактором и SEO-специалистом. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['copywriting', 'content_marketing'], niceSkills: ['seo', 'smm'], format: 'remote', city: null, ...autumn, slots: 2 },
  { key: 'm3', employer: 'sarafan', title: 'Стажёр по таргетированной рекламе', description: 'Настройка и ведение рекламных кампаний клиентов агентства под присмотром наставника. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['targeted_ads', 'web_analytics'], niceSkills: ['smm', 'excel'], format: 'remote', city: null, ...winter, slots: 1 },
  { key: 'm4', employer: 'zal', title: 'Помощник ивент-менеджера', description: 'Подготовка городских мероприятий: подрядчики, площадки, списки гостей, работа на площадке в день события. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['event_management', 'negotiations'], niceSkills: ['pr', 'smm'], format: 'office', city: MSK, ...autumn, slots: 2 },
  { key: 'm5', employer: 'zal', title: 'PR-стажёр', description: 'Пресс-релизы, общение с журналистами и партнёрами, подготовка спикеров к выступлениям. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['pr', 'copywriting'], niceSkills: ['public_speaking', 'smm'], format: 'hybrid', city: MSK, ...winter, slots: 1 },
  // Экономика и финансы
  { key: 'f1', employer: 'saldo', title: 'Стажёр-бухгалтер', description: 'Первичка, банковские выписки и отчётность малых компаний — клиентов бюро, в 1С. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['accounting', '1c_accounting'], niceSkills: ['tax_accounting', 'excel'], format: 'office', city: MSK, ...autumn, slots: 2 },
  { key: 'f2', employer: 'kirpich', title: 'Стажёр финансового аналитика', description: 'Анализ смет и платежей по объектам, помощь в подготовке бюджета на следующий год. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['financial_analysis', 'excel'], niceSkills: ['financial_modeling', 'budgeting'], format: 'hybrid', city: MSK, ...autumn, slots: 1 },
  { key: 'f3', employer: 'saldo', title: 'Стажёр по МСФО', description: 'Трансформация отчётности клиентов в МСФО, перевод документов с английского. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['ifrs', 'english_b2'], niceSkills: ['financial_analysis', 'excel'], format: 'remote', city: null, ...winter, slots: 1 },
  { key: 'f4', employer: 'kolos', title: 'Помощник экономиста', description: 'Планирование затрат на сезон, контроль исполнения бюджета по полям и технике. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['budgeting', 'excel'], niceSkills: ['1c_accounting'], format: 'office', city: MSK, ...winter, slots: 1 },
  // Право
  { key: 'l1', employer: 'st421', title: 'Помощник юриста', description: 'Проверка и подготовка договоров, правовые справки по гражданским спорам клиентов. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['contract_law', 'civil_law'], niceSkills: ['consultant_plus', 'business_writing'], format: 'office', city: MSK, ...autumn, slots: 2 },
  { key: 'l2', employer: 'kirpich', title: 'Стажёр-юрист по закупкам', description: 'Сопровождение участия в госзакупках: документы заявки, проверка контрактов. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['public_procurement', 'contract_law'], niceSkills: ['consultant_plus'], format: 'hybrid', city: MSK, ...autumn, slots: 1 },
  { key: 'l3', employer: 'st421', title: 'Стажёр корпоративной практики', description: 'Корпоративные документы клиентов: уставы, протоколы, сделки с долями. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['corporate_law', 'legal_research'], niceSkills: ['english_b2'], format: 'remote', city: null, ...winter, slots: 1 },
  { key: 'l4', employer: 'processy', title: 'Помощник по трудовому праву', description: 'Кадровые документы и консультации клиентов по трудовым вопросам. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['labor_law', 'hr_admin'], niceSkills: ['consultant_plus'], format: 'remote', city: null, ...winter, slots: 1 },
  // Управление, HR и продажи
  { key: 'h1', employer: 'processy', title: 'Стажёр-рекрутер', description: 'Поиск и первичный отбор кандидатов для клиентов, переписка и назначение интервью. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['recruiting', 'business_writing'], niceSkills: ['crm', 'negotiations'], format: 'remote', city: null, ...autumn, slots: 2 },
  { key: 'h2', employer: 'zerna', title: 'Помощник HR', description: 'Оформление сотрудников кофеен, ведение кадровых документов и графиков. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['hr_admin', 'records_management'], niceSkills: ['recruiting', 'excel'], format: 'office', city: MSK, ...autumn, slots: 1 },
  { key: 'h3', employer: 'processy', title: 'Стажёр проектного офиса', description: 'Описание процессов клиентов, планы проектов, подготовка встреч и презентаций. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['project_management', 'business_processes'], niceSkills: ['presentations', 'excel'], format: 'hybrid', city: MSK, ...winter, slots: 1 },
  { key: 'h4', employer: 'marshrut', title: 'Помощник менеджера по продажам', description: 'Работа с заявками корпоративных клиентов, ведение сделок в CRM. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['sales', 'crm'], niceSkills: ['b2b_sales', 'negotiations'], format: 'office', city: MSK, ...winter, slots: 2 },
  // IT и дизайн
  { key: 'i1', employer: 'luch', title: 'Стажёр фронтенд-разработки', description: 'Вёрстка и доработка интерфейсов клиентских сайтов в команде студии. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['html_css', 'javascript'], niceSkills: ['react', 'git'], format: 'remote', city: null, ...autumn, slots: 2 },
  { key: 'i2', employer: 'luch', title: 'Стажёр-тестировщик', description: 'Ручное тестирование сайтов и приложений, заведение задач на ошибки. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['qa_testing', 'git'], niceSkills: ['sql', 'javascript'], format: 'hybrid', city: MSK, ...winter, slots: 1 },
  { key: 'i3', employer: 'vecher', title: 'Стажёр-дизайнер интерфейсов', description: 'Макеты страниц курсов и личного кабинета ученика в Figma. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['figma', 'ui_ux'], niceSkills: ['graphic_design', 'presentations'], format: 'remote', city: null, ...autumn, slots: 1 },
  { key: 'i4', employer: 'polka', title: 'Стажёр-дизайнер для соцсетей', description: 'Баннеры, карточки товаров и обложки для соцсетей магазина. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['graphic_design', 'photoshop'], niceSkills: ['figma', 'video_editing'], format: 'remote', city: null, ...winter, slots: 1 },
  // Задачи малого бизнеса: маркетплейсы и сайт (справочник от 28.09)
  { key: 'b1', employer: 'polka', title: 'Менеджер маркетплейсов', description: 'Карточки товаров магазина на Wildberries и Ozon: тексты, фото, цены, ответы на вопросы покупателей. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['marketplace_cards', 'wildberries'], niceSkills: ['ozon', 'product_photo', 'unit_economics'], format: 'remote', city: null, ...autumn, slots: 2 },
  { key: 'b2', employer: 'zerna', title: 'Помощник по сайту и рассылкам', description: 'Обновлять сайт сети кофеен на Tilda, собирать рассылки о новинках и акциях, отвечать на отзывы. Неполная занятость — 20 часов в неделю, график обсуждается.', requiredSkills: ['no_code', 'email_marketing'], niceSkills: ['seo', 'canva', 'reviews_management'], format: 'remote', city: null, ...winter, slots: 1 },
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
  where: { city?: string; formats?: WorkFormat[] } = {},
): DemoStudent => ({
  key: `s${n}`,
  maxUserId: -2000 - n,
  firstName,
  lastName,
  phone: `+7000000${2000 + n}`,
  university: UNI,
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
];

/** Стажировки, где у первого подходящего кандидата уже «приглашён», а у третьего — «отказ», чтобы в демо были видны все статусы. */
export const DEMO_INVITE_KEYS = ['a1', 'a3', 'm1', 'f1', 'f4'];
