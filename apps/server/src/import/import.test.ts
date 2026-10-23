import { describe, expect, it } from 'vitest';
import { skillRows } from '../seed/skills.js';
import { backfillTrudvsemQuotes, backfillTrudvsemTags, importTrudvsem } from './index.js';
import { mapSkills, SKILL_MAP_CODES } from './skillMap.js';
import { cityOf, fetchAll, fetchPilotVacancies, formatOf, mapVacancy, pickFields, placeTypeOf, safeSourceUrl, stripContacts, typographQuotes, type TrudvsemVacancy } from './trudvsem.js';
import { TRUDVSEM_SNAPSHOT } from './trudvsemSnapshot.js';

const vacancy = (over: Partial<TrudvsemVacancy> = {}): TrudvsemVacancy => ({
  id: 'v1',
  'job-name': 'Бухгалтер-стажер',
  company: { name: 'ООО «Пример»' },
  region: { region_code: '7700000000000', name: 'Город Москва' },
  addresses: { address: [{ location: 'г Москва, ул. Тверская, д. 1' }] },
  schedule: 'Полный рабочий день',
  duty: 'Ведение первичной документации, работа в 1С: Бухгалтерия.',
  requirements: '',
  skills: [],
  work_places: 2,
  vac_url: 'https://trudvsem.ru/vacancy/card/1/v1',
  requirement: { experience: 0 },
  ...over,
});

describe('mapSkills', () => {
  it('понимает русские окончания', () => {
    expect(mapSkills(['Знание бухгалтерского учета'])).toContain('accounting');
    expect(mapSkills(['Стажер в отдел обслуживания клиентов'])).toContain('customer_support');
    expect(mapSkills(['Опыт ведения социальных сетей'])).toContain('smm');
  });

  it('нет ложных совпадений на частых словах', () => {
    expect(mapSkills(['Помощник директора'])).not.toContain('context_ads');
    expect(mapSkills(['Гарантируем официальное оформление'])).not.toContain('consultant_plus');
    expect(mapSkills(['Отслеживать метрики проекта'])).not.toContain('web_analytics');
    expect(mapSkills(['Работа в команде, ответственность, пунктуальность'])).toEqual([]);
  });

  it('узнаёт Яндекс Директ, Метрику, 1С: Торговлю, маркетплейсы, SQL', () => {
    expect(mapSkills(['Яндекс Директ, Яндекс.Метрика, 1С: Управление торговлей, Wildberries, SQL'])).toEqual(
      expect.arrayContaining(['context_ads', 'web_analytics', '1c_trade', 'wildberries', 'sql']),
    );
  });

  it('английский B2 не дублируется B1', () => {
    expect(mapSkills(['Английский язык на уровне B2'])).toEqual(['english_b2']);
    expect(mapSkills(['Английский язык'])).toEqual(['english_b1']);
  });

  it('все коды словаря есть в справочнике', () => {
    const codes = new Set(skillRows().map((r) => r.code));
    for (const c of SKILL_MAP_CODES) expect(codes.has(c), c).toBe(true);
  });
});

describe('mapVacancy', () => {
  it('вакансия → место: источник, ссылка, навыки, город', () => {
    const p = mapVacancy(vacancy())!;
    expect(p).toMatchObject({
      sourceId: 'v1',
      sourceUrl: 'https://trudvsem.ru/vacancy/card/1/v1',
      title: 'Бухгалтер-стажер',
      companyName: 'ООО «Пример»',
      format: 'office',
      city: 'Москва',
      slots: 2,
    });
    expect(p.requiredSkills).toEqual(expect.arrayContaining(['accounting', '1c_accounting']));
    expect(p.requiredSkills.length).toBeLessThanOrEqual(5);
    expect(p.description).toContain('Источник — «Работа России»');
  });

  it('не берём: нужен опыт, не студенческое место, риелтор, ни одного навыка из справочника', () => {
    expect(mapVacancy(vacancy({ requirement: { experience: 3 } }))).toBeNull();
    expect(mapVacancy(vacancy({ 'job-name': 'Менеджер по продажам' }))).toBeNull();
    expect(mapVacancy(vacancy({ 'job-name': 'Риэлтор по недвижимости / стажер с обучением', duty: 'Продажи, переговоры' }))).toBeNull();
    expect(mapVacancy(vacancy({ 'job-name': 'Стажер', duty: 'Разные поручения', skills: [], requirements: '' }))).toBeNull();
  });

  it('удалёнка — из employment или schedule: формат remote, без города', () => {
    expect(formatOf(vacancy({ employment: 'Дистанционная (удаленная) работа' }))).toBe('remote');
    expect(formatOf(vacancy({ schedule: 'Удалённая работа' }))).toBe('remote');
    expect(formatOf(vacancy({ employment: 'Стажировка' }))).toBe('office');
    expect(mapVacancy(vacancy({ employment: 'Дистанционная (удаленная) работа' }))).toMatchObject({ format: 'remote', city: null });
  });

  it('город: из адреса; по региону — только для городов федерального значения', () => {
    expect(cityOf(vacancy({ addresses: { address: [{ location: 'Республика Татарстан, г Казань, ул. Баумана' }] } }))).toBe('Казань');
    expect(cityOf(vacancy({ addresses: { address: [{ location: 'г. Казань, ул. Пушкина' }] } }))).toBe('Казань');
    expect(cityOf(vacancy({ addresses: { address: [] }, region: { region_code: '7700000000000' } }))).toBe('Москва');
    // Алабуга, Елабужский район: в адресе нет города — это не Казань
    const alabuga = vacancy({ addresses: { address: [{ location: 'Республика Татарстан, Елабужский р-н, тер ОЭЗ Алабуга' }] }, region: { region_code: '1600000000000' } });
    expect(cityOf(alabuga)).toBeNull();
    expect(mapVacancy(alabuga)).toBeNull();
  });

  it('телефоны и почта из обязанностей и требований не попадают в описание', () => {
    expect(stripContacts('Звоните +7 (495) 937-47-47 или 8 912 345 67 89, пишите hr@example.ru')).toBe(
      'Звоните [контакт скрыт] или [контакт скрыт], пишите [контакт скрыт]',
    );
    const p = mapVacancy(vacancy({ duty: 'Первичная документация. Вопросы: +7 (495) 000-00-00, hr@firm.ru' }))!;
    expect(p.description).not.toMatch(/000-00-00|hr@firm\.ru/);
  });

  it('тип места и оплата (#22)', () => {
    expect(placeTypeOf(vacancy({ 'job-name': 'Практикант в отдел аудита' }))).toBe('practice');
    expect(placeTypeOf(vacancy({ schedule: 'Неполный рабочий день/неполная рабочая неделя' }))).toBe('part_time');
    expect(placeTypeOf(vacancy())).toBe('internship');
    expect(mapVacancy(vacancy({ salary_min: 50000 }))).toMatchObject({ paid: true, salary: 50000 });
    expect(mapVacancy(vacancy({ salary_min: 0 }))).toMatchObject({ paid: null, salary: null });
  });

  it('кривая зарплата не роняет импорт: вне 1…10 000 000 ₽ — не указана', () => {
    for (const bad of [0.4, 3e9, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(mapVacancy(vacancy({ salary_min: bad })), String(bad)).toMatchObject({ paid: null, salary: null });
    }
    expect(mapVacancy(vacancy({ salary_min: 45000.6 }))).toMatchObject({ paid: true, salary: 45001 });
  });

  it('телефоны с 4–5-значным кодом города и почта на кириллице тоже скрываются', () => {
    expect(stripContacts('Тел. +7 (8552) 12-34-56, доп. 8 (84342) 1-23-45')).toBe('Тел. [контакт скрыт], доп. [контакт скрыт]');
    expect(stripContacts('Резюме: кадры@компания.рф')).toBe('Резюме: [контакт скрыт]');
    // даты, суммы и номера приказов не трогаем
    expect(stripContacts('С 01.10.2026, оклад 45 000 ₽, приказ № 885/390')).toBe('С 01.10.2026, оклад 45 000 ₽, приказ № 885/390');
  });

  it('ссылка на оригинал — только trudvsem.ru, по https', () => {
    expect(safeSourceUrl('http://trudvsem.ru/vacancy/card/1/2')).toBe('https://trudvsem.ru/vacancy/card/1/2');
    expect(safeSourceUrl('https://evil.example/trudvsem.ru')).toBeNull();
    expect(safeSourceUrl('javascript:alert(1)')).toBeNull();
    expect(safeSourceUrl(undefined)).toBeNull();
  });

  it('pickFields убирает контакты отдела кадров', () => {
    const raw = { ...vacancy(), contact_list: [{ contact_type: 'Телефон', contact_value: '+7(495) 000-00-00' }], contact_person: 'Алексей', company: { name: 'ООО', email: 'hr@example.ru' } };
    const picked = JSON.stringify(pickFields(raw as TrudvsemVacancy));
    expect(picked).not.toContain('contact');
    expect(picked).not.toContain('hr@example.ru');
    expect(picked).not.toContain('Алексей');
  });
});

describe('снимок', () => {
  it('не пустой, все вакансии импортируются, контактов нет', () => {
    expect(TRUDVSEM_SNAPSHOT.vacancies.length).toBeGreaterThan(0);
    for (const v of TRUDVSEM_SNAPSHOT.vacancies) expect(mapVacancy(v), v.id).not.toBeNull();
    expect(JSON.stringify(TRUDVSEM_SNAPSHOT)).not.toMatch(/contact|email|@[a-z]/i);
  });
});

// Фальшивый API: по региону и запросу отдаёт `perQuery` вакансий страницами; fail(url) — сбой запроса
function fakeFetch(fail: (url: string) => boolean, perQuery = 1, limit = 50) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    if (fail(url)) throw new Error('timeout');
    const region = /region\/(\d+)/.exec(url)![1];
    const q = decodeURIComponent(/text=([^&]+)/.exec(url)![1]!);
    const page = Number(/offset=(\d+)/.exec(url)![1]);
    const ids = Array.from({ length: perQuery }, (_, i) => `${region}-${q}-${i}`).slice(page * limit, (page + 1) * limit);
    return new Response(JSON.stringify({ status: '200', meta: { total: perQuery, limit }, results: { vacancies: ids.map((id) => ({ vacancy: vacancy({ id }) })) } }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('получение страниц', () => {
  it('https, регион, запрос, offset — номер страницы; листает до meta.total', async () => {
    const f = fakeFetch(() => false, 59);
    const r = await fetchAll('7700000000000', 'стажер', { fetch: f.fn });
    expect(r).toMatchObject({ complete: true });
    expect(r.vacancies).toHaveLength(59);
    expect(f.calls).toEqual([
      `https://opendata.trudvsem.ru/api/v1/vacancies/region/7700000000000?text=${encodeURIComponent('стажер')}&offset=0&limit=50`,
      `https://opendata.trudvsem.ru/api/v1/vacancies/region/7700000000000?text=${encodeURIComponent('стажер')}&offset=1&limit=50`,
    ]);
  });

  it('вторая страница не ответила — запрос неудачный, причина видна', async () => {
    const r = await fetchPilotVacancies({ fetch: fakeFetch((u) => u.includes('7700000000000') && u.includes('offset=1'), 59).fn });
    expect(r.failed).toBe(2);
    expect(r.errors[0]).toMatch(/7700000000000.*timeout/);
    expect(r.vacancies.length).toBeGreaterThan(0);
  });
});

// Фальшивая БД: помнит SQL; trudvsemRows — сколько мест из «Работа России» уже есть
function fakeDb(trudvsemRows = 0) {
  const sql: { text: string; params?: unknown[] }[] = [];
  return {
    sql,
    db: {
      query: async (text: string, params?: unknown[]) => {
        sql.push({ text, params });
        if (text.includes('count(*)')) return [{ n: trudvsemRows }];
        return text.includes('RETURNING id') ? [[{ id: 1 }], 1] : [];
      },
    },
  };
}

const inserts = (sql: { text: string }[]) => sql.filter((q) => q.text.includes('INSERT INTO internships'));

describe('importTrudvsem', () => {
  it('API ответил полностью — записываем места и закрываем пропавшие', async () => {
    const { db, sql } = fakeDb();
    const r = await importTrudvsem(db, { fetch: fakeFetch(() => false).fn });
    expect(r).toMatchObject({ from: 'api', vacancies: 4, imported: 4, closed: 1 });
    expect(inserts(sql)).toHaveLength(4);
    expect(inserts(sql)[0]!.text).toContain('DO UPDATE');
    expect(sql.some((q) => q.text.includes("SET status = 'closed'"))).toBe(true);
  });

  it('часть запросов не ответила — берём пришедшее, но ничего не закрываем', async () => {
    const { db, sql } = fakeDb();
    const r = await importTrudvsem(db, { fetch: fakeFetch((u) => u.includes('1600000000000')).fn });
    expect(r).toMatchObject({ from: 'api', imported: 2, closed: 0 });
    expect(sql.some((q) => q.text.includes("SET status = 'closed'"))).toBe(false);
  });

  it('API недоступен и база пуста — заполняем из снимка, существующее не трогаем', async () => {
    const { db, sql } = fakeDb(0);
    const r = await importTrudvsem(db, { fetch: fakeFetch(() => true).fn, snapshot: [vacancy({ id: 's1' }), vacancy({ id: 's2', 'job-name': 'Менеджер' })] });
    expect(r).toMatchObject({ from: 'snapshot', vacancies: 2, imported: 1, skipped: 1, closed: 0 });
    expect(inserts(sql)).toHaveLength(1);
    expect(inserts(sql)[0]!.text).toContain('DO NOTHING');
  });

  it('API недоступен, а места уже есть — снимок не открывает закрытое и ничего не пишет', async () => {
    const { db, sql } = fakeDb(15);
    const r = await importTrudvsem(db, { fetch: fakeFetch(() => true).fn, snapshot: [vacancy({ id: 's1' })] });
    expect(r).toMatchObject({ from: 'none', imported: 0, closed: 0 });
    expect(inserts(sql)).toHaveLength(0);
    expect(sql.some((q) => q.text.includes('UPDATE internships'))).toBe(false);
  });
});

describe('теги мест «Работа России»', () => {
  it('новое место получает теги по обязательным навыкам', async () => {
    const { db, sql } = fakeDb();
    await importTrudvsem(db, { fetch: fakeFetch(() => false).fn });
    const first = inserts(sql)[0] as { text: string; params?: unknown[] };
    expect(first.text).toContain('tags = EXCLUDED.tags');
    expect(Array.isArray(first.params?.[12])).toBe(true);
  });

  it('дозаполнение: только пустые теги и только если есть подходящий тег', async () => {
    const sql: { text: string; params?: unknown[] }[] = [];
    const db = {
      query: async (text: string, params?: unknown[]) => {
        sql.push({ text, params });
        return text.startsWith('SELECT')
          ? [{ id: 1, required_skills: ['excel', 'wildberries'] }, { id: 2, required_skills: ['contract_law'] }]
          : [];
      },
    };
    expect(await backfillTrudvsemTags(db)).toBe(1);
    const updates = sql.filter((q) => q.text.startsWith('UPDATE'));
    expect(updates).toHaveLength(1);
    expect(updates[0]!.params).toEqual([1, ['marketplaces', 'spreadsheets']]);
    expect(updates[0]!.text).toContain('cardinality(tags) = 0');
  });
});

describe('«ёлочки» в названиях «Работа России» (#116, находка 6)', () => {
  it('прямые и «лапки» — в «ёлочки», регистр не трогаем', () => {
    expect(typographQuotes('ООО "АРС НЕДВИЖИМОСТЬ"')).toBe('ООО «АРС НЕДВИЖИМОСТЬ»');
    expect(typographQuotes('"Ромашка"')).toBe('«Ромашка»');
    expect(typographQuotes('АО „Вектор“')).toBe('АО «Вектор»');
    expect(typographQuotes('ГБУ "Центр (филиал "Север")"')).toBe('ГБУ «Центр (филиал «Север»)»');
    expect(typographQuotes('ИП Иванов')).toBe('ИП Иванов');
    expect(typographQuotes('Стажёр в «Луч»')).toBe('Стажёр в «Луч»');
  });

  it('импорт ставит «ёлочки» в компанию и название', () => {
    const p = mapVacancy(vacancy({ company: { name: 'ООО "ТЕСТ"' }, 'job-name': 'Стажёр "аналитик"' }));
    expect(p?.companyName).toBe('ООО «ТЕСТ»');
    expect(p?.title).toBe('Стажёр «аналитик»');
  });

  it('дозаполнение: уже загруженные места с прямыми кавычками', async () => {
    const sql: { text: string; params?: unknown[] }[] = [];
    const db = {
      query: async (text: string, params?: unknown[]) => {
        sql.push({ text, params });
        return text.startsWith('SELECT') ? [{ id: 5, company_name: 'ООО "АРС"', title: 'Стажёр' }] : [];
      },
    };
    expect(await backfillTrudvsemQuotes(db)).toBe(1);
    expect(sql.find((q) => q.text.startsWith('UPDATE'))?.params).toEqual([5, 'ООО «АРС»', 'Стажёр']);
  });
});
