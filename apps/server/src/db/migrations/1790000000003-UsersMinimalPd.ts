import type { MigrationInterface, QueryRunner } from 'typeorm';

// Минимум ПД (аудит 28.09): ник MAX не нужен ни одному сценарию — удаляем; фамилию до согласия не храним.
export class UsersMinimalPd1790000000003 implements MigrationInterface {
  name = 'UsersMinimalPd1790000000003';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE users DROP COLUMN username;
      UPDATE users SET last_name = NULL WHERE consent_at IS NULL AND NOT is_demo;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE users ADD COLUMN username text;`);
  }
}
