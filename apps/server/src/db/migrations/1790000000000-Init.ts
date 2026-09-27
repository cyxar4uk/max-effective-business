import type { MigrationInterface, QueryRunner } from 'typeorm';

// Начальная схема. Черновик — docs/03_product.md, раздел «Данные».
// Навыки хранятся массивами кодов из справочника skills: так их проще сравнивать в matching.
export class Init1790000000000 implements MigrationInterface {
  name = 'Init1790000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE users (
        id              bigserial PRIMARY KEY,
        max_user_id     bigint NOT NULL UNIQUE,
        first_name      text,
        last_name       text,
        username        text,
        phone           text,
        phone_saved_at  timestamptz,
        consent_at      timestamptz,
        consent_version text,
        is_demo         boolean NOT NULL DEFAULT false,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE skills (
        code        text PRIMARY KEY,
        name        text NOT NULL,
        group_name  text NOT NULL,
        sort        integer NOT NULL DEFAULT 0
      );

      CREATE TABLE student_profiles (
        user_id     bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        university  text NOT NULL,
        faculty     text,
        course      smallint NOT NULL CHECK (course BETWEEN 1 AND 6),
        direction   text NOT NULL,
        city        text NOT NULL,
        formats     text[] NOT NULL CHECK (formats <@ ARRAY['office','remote','hybrid']::text[] AND cardinality(formats) > 0),
        skills      text[] NOT NULL DEFAULT '{}',
        is_demo     boolean NOT NULL DEFAULT false,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE employers (
        id             bigserial PRIMARY KEY,
        owner_user_id  bigint NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        company_name   text NOT NULL,
        city           text NOT NULL,
        contact_name   text NOT NULL,
        is_demo        boolean NOT NULL DEFAULT false,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE internships (
        id               bigserial PRIMARY KEY,
        employer_id      bigint REFERENCES employers(id) ON DELETE CASCADE,
        -- для импортированных без работодателя в системе
        company_name     text,
        title            text NOT NULL,
        description      text NOT NULL DEFAULT '',
        required_skills  text[] NOT NULL DEFAULT '{}',
        nice_skills      text[] NOT NULL DEFAULT '{}',
        format           text NOT NULL CHECK (format IN ('office','remote','hybrid')),
        city             text,
        starts_on        date,
        ends_on          date,
        slots            integer NOT NULL DEFAULT 1 CHECK (slots > 0),
        status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
        source           text NOT NULL DEFAULT 'employer' CHECK (source IN ('employer','demo','trudvsem','career_center')),
        source_id        text,
        source_url       text,
        is_demo          boolean NOT NULL DEFAULT false,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        CHECK (employer_id IS NOT NULL OR company_name IS NOT NULL),
        CHECK (format = 'remote' OR city IS NOT NULL),
        CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
        UNIQUE (source, source_id)
      );
      CREATE INDEX internships_employer_idx ON internships (employer_id);
      CREATE INDEX internships_open_idx ON internships (created_at DESC) WHERE status = 'open';

      CREATE TABLE interests (
        id               bigserial PRIMARY KEY,
        student_user_id  bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        internship_id    bigint NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
        status           text NOT NULL CHECK (status IN ('skipped','interested','invited','declined')),
        match_score      smallint NOT NULL CHECK (match_score BETWEEN 0 AND 100),
        match            jsonb NOT NULL,
        is_demo          boolean NOT NULL DEFAULT false,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        UNIQUE (student_user_id, internship_id)
      );
      CREATE INDEX interests_internship_idx ON interests (internship_id, status, match_score DESC);

      CREATE TABLE notifications (
        id          bigserial PRIMARY KEY,
        user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind        text NOT NULL,
        -- ключ идемпотентности: одно и то же уведомление не отправляется дважды
        dedupe_key  text UNIQUE,
        payload     jsonb NOT NULL DEFAULT '{}',
        status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
        attempts    integer NOT NULL DEFAULT 0,
        last_error  text,
        created_at  timestamptz NOT NULL DEFAULT now(),
        sent_at     timestamptz
      );
      CREATE INDEX notifications_pending_idx ON notifications (created_at) WHERE status = 'pending';
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE notifications;
      DROP TABLE interests;
      DROP TABLE internships;
      DROP TABLE employers;
      DROP TABLE student_profiles;
      DROP TABLE skills;
      DROP TABLE users;
    `);
  }
}
