import { describe, expect, it } from 'vitest';
import { skillRows } from '../seed/skills.js';
import { importTrudvsem } from './index.js';
import { mapSkills, SKILL_MAP_CODES } from './skillMap.js';
import { cityOf, fetchVacancies, mapVacancy, pickFields, type TrudvsemVacancy } from './trudvsem.js';
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

  it('узнаёт Яндекс Директ, Метрику, 1С, SQL', () => {
    expect(mapSkills(['Яндекс Директ, Яндекс.Метрика, 1С: Бухгалтерия, SQL'])).toEqual(
      expect.arrayContaining(['context_ads', 'web_analytics', '1c_accounting', 'sql']),
    );
  });

  it('английский B2 не дублируется B1', () => {
    expect(mapSkills(['Английский язык на уровне B2'])).toEqual(['english_b2']);
    expect(mapSkills(['Английский язык'])).toEqual(['english_b1']);
  });

  it('возвращает только коды, которые есть в справочнике', () => {
    const codes = new Set(skillRows().map((r) => r.code));
    const all = mapSkills(['Excel, SQL, Wildberries, Ozon, маркетплейсы, 1С: Зарплата, Canva, WordPress, рассылки, бухгалтер']);
    expect(all.length).toBeGreaterThan(0);
    for (const c of all) expect(codes.has(c), c).toBe(true);
  });

  it('коды словаря записаны в формате справочника', () => {
    for (const c of SKILL_MAP_CODES) expect(c).toMatch(/^[a-z0-9_]+$/);
  });
});

describe('mapVacancy', () => {
  it('вакансия → место: источник, ссылка, навыки, город, без контактов', () => {
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

  it('не берём: нужен опыт, не студенческое место, ни одного навыка из справочника', () => {
    expect(mapVacancy(vacancy({ requirement: { experience: 3 } }))).toBeNull();
    expect(mapVacancy(vacancy({ 'job-name': 'Риелтор по недвижимости' }))).toBeNull();
    expect(mapVacancy(vacancy({ 'job-name': 'Стажер', duty: 'Разные поручения', skills: [], requirements: '' }))).toBeNull();
  });

  it('удалённая работа — формат remote и без города', () => {
    expect(mapVacancy(vacancy({ schedule: 'Удаленная работа' }))).toMatchObject({ format: 'remote', city: null });
  });

  it('город: из адреса, иначе по региону пилота', () => {
    expect(cityOf(vacancy({ addresses: { address: [{ location: 'Республика Татарстан, г Казань, ул. Баумана' }] } }))).toBe('Казань');
    expect(cityOf(vacancy({ addresses: { address: [] }, region: { region_code: '1600000000000', name: 'Республика Татарстан' } }))).toBe('Казань');
    expect(cityOf(vacancy({ addresses: { address: [] }, region: { region_code: '7700000000000', name: 'Город Москва' } }))).toBe('Москва');
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

// Фальшивый API: отвечает вакансией по коду региона и запросу или падает
function fakeFetch(fail: (url: string) => boolean) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    if (fail(url)) throw new Error('timeout');
    const id = `${/region\/(\d+)/.exec(url)![1]}-${decodeURIComponent(/text=([^&]+)/.exec(url)![1]!)}`;
    return new Response(JSON.stringify({ status: '200', results: { vacancies: [{ vacancy: vacancy({ id }) }] } }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function fakeDb() {
  const sql: { text: string; params?: unknown[] }[] = [];
  return {
    sql,
    db: {
      query: async (text: string, params?: unknown[]) => {
        sql.push({ text, params });
        return text.includes('RETURNING id') ? [[{ id: 1 }], 1] : [];
      },
    },
  };
}

describe('fetchVacancies', () => {
  it('регион, запрос и 50 на страницу', async () => {
    const f = fakeFetch(() => false);
    await fetchVacancies('7700000000000', 'стажер', { fetch: f.fn });
    expect(f.calls[0]).toBe(`http://opendata.trudvsem.ru/api/v1/vacancies/region/7700000000000?text=${encodeURIComponent('стажер')}&offset=0&limit=50`);
  });
});

describe('importTrudvsem', () => {
  it('API ответил полностью — записываем места и закрываем пропавшие', async () => {
    const { db, sql } = fakeDb();
    const r = await importTrudvsem(db, { fetch: fakeFetch(() => false).fn });
    expect(r).toMatchObject({ from: 'api', vacancies: 4, imported: 4, closed: 1 });
    expect(sql.filter((q) => q.text.includes('INSERT INTO internships'))).toHaveLength(4);
    expect(sql.some((q) => q.text.includes("SET status = 'closed'"))).toBe(true);
    const insert = sql.find((q) => q.text.includes('INSERT INTO internships'))!;
    expect(insert.text).toContain("'trudvsem'");
    expect(insert.text).toContain('ON CONFLICT (source, source_id)');
  });

  it('часть запросов не ответила — берём пришедшее, но ничего не закрываем', async () => {
    const { db, sql } = fakeDb();
    const r = await importTrudvsem(db, { fetch: fakeFetch((u) => u.includes('1600000000000')).fn });
    expect(r).toMatchObject({ from: 'api', imported: 2, closed: 0 });
    expect(sql.some((q) => q.text.includes("SET status = 'closed'"))).toBe(false);
  });

  it('API недоступен — берём снимок, сценарий не ломается', async () => {
    const { db, sql } = fakeDb();
    const r = await importTrudvsem(db, { fetch: fakeFetch(() => true).fn, snapshot: [vacancy({ id: 's1' }), vacancy({ id: 's2', 'job-name': 'Риелтор' })] });
    expect(r).toMatchObject({ from: 'snapshot', vacancies: 2, imported: 1, skipped: 1, closed: 0 });
    expect(sql.filter((q) => q.text.includes('INSERT INTO internships'))).toHaveLength(1);
  });
});
