import type { MigrationInterface, QueryRunner } from 'typeorm';

// Лимит «N новых мест в день» на каждого подходящего студента считает его уведомления этого вида за день рассылки
// (botData.countInDispatchDay). Без индекса это полный проход по растущей таблице notifications на каждого студента.
export class NotificationsUserKindIdx1790000000005 implements MigrationInterface {
  name = 'NotificationsUserKindIdx1790000000005';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE INDEX IF NOT EXISTS notifications_user_kind_created_idx ON notifications (user_id, kind, created_at);`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS notifications_user_kind_created_idx;`);
  }
}
