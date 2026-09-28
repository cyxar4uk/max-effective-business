import type { MigrationInterface, QueryRunner } from 'typeorm';

// Решения Артёма от 27–28.09 (docs/decisions.md): у места есть тип и оплата, теги задач, месяц практики в анкете.
// У уже существующих мест (демо, «Работа России») тип — «стажировка», оплата не указана (NULL).
export class PlaceFields1790000000002 implements MigrationInterface {
  name = 'PlaceFields1790000000002';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE internships
        ADD COLUMN type   text    NOT NULL DEFAULT 'internship' CHECK (type IN ('practice','internship','part_time')),
        -- NULL — не указано (импорт, старые записи); при публикации через API обязательно
        ADD COLUMN paid   boolean,
        -- рублей в месяц, по желанию и только у оплачиваемых
        ADD COLUMN salary integer CHECK (salary IS NULL OR salary > 0),
        ADD COLUMN tags   text[]  NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 3),
        ADD CONSTRAINT internships_salary_only_if_paid CHECK (salary IS NULL OR paid IS TRUE);
      CREATE INDEX internships_tags_idx ON internships USING gin (tags);

      ALTER TABLE student_profiles
        ADD COLUMN practice_month text CHECK (practice_month IS NULL OR practice_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

      -- Справочник тегов задач («Сайт», «Маркетплейсы», «1С»…). Заполняет сид (Тимур), как справочник навыков.
      CREATE TABLE task_tags (
        code    text PRIMARY KEY,
        name    text NOT NULL,
        sort    integer NOT NULL DEFAULT 0,
        -- навыки, которые тег подставляет в форму работодателя
        skills  text[] NOT NULL DEFAULT '{}'
      );
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE task_tags;
      ALTER TABLE student_profiles DROP COLUMN practice_month;
      DROP INDEX internships_tags_idx;
      ALTER TABLE internships
        DROP CONSTRAINT internships_salary_only_if_paid,
        DROP COLUMN tags, DROP COLUMN salary, DROP COLUMN paid, DROP COLUMN type;
    `);
  }
}
