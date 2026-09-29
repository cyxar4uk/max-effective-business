import type { MigrationInterface, QueryRunner } from 'typeorm';

// Когда студент впервые нажал «Интересно» — для метрики пилота «от публикации до первого отклика».
// created_at не подходит: отклик мог начаться с «Пропустить». Старым откликам берём время создания.
export class InterestedAt1790000000004 implements MigrationInterface {
  name = 'InterestedAt1790000000004';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE interests ADD COLUMN interested_at timestamptz;
      UPDATE interests SET interested_at = created_at WHERE status <> 'skipped';
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE interests DROP COLUMN interested_at;`);
  }
}
