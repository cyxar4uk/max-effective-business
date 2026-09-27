import type { MigrationInterface, QueryRunner } from 'typeorm';

// Очередь уведомлений: время следующей попытки. Запись «берётся в работу» сдвигом next_attempt_at вперёд (аренда),
// поэтому после падения процесса незавершённая отправка сама вернётся в очередь.
export class NotificationQueue1790000000001 implements MigrationInterface {
  name = 'NotificationQueue1790000000001';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE notifications ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
      DROP INDEX notifications_pending_idx;
      CREATE INDEX notifications_due_idx ON notifications (next_attempt_at) WHERE status = 'pending';
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX notifications_due_idx;
      CREATE INDEX notifications_pending_idx ON notifications (created_at) WHERE status = 'pending';
      ALTER TABLE notifications DROP COLUMN next_attempt_at;
    `);
  }
}
