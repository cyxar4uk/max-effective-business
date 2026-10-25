import type { MigrationInterface, QueryRunner } from 'typeorm';

// Реквизиты компании для документов практики (F-16): договор о практической подготовке и письмо о согласии.
// Все поля необязательные — компания заполняет их, только когда нужны документы.
export class EmployerRequisites1790000000006 implements MigrationInterface {
  name = 'EmployerRequisites1790000000006';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE employers
        ADD COLUMN legal_name text,
        ADD COLUMN inn text,
        ADD COLUMN ogrn text,
        ADD COLUMN legal_address text,
        ADD COLUMN signer_name text,
        ADD COLUMN signer_position text,
        ADD COLUMN signer_basis text,
        ADD COLUMN responsible_name text,
        ADD COLUMN responsible_position text,
        ADD COLUMN responsible_phone text,
        ADD COLUMN responsible_email text;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE employers
        DROP COLUMN legal_name, DROP COLUMN inn, DROP COLUMN ogrn, DROP COLUMN legal_address,
        DROP COLUMN signer_name, DROP COLUMN signer_position, DROP COLUMN signer_basis,
        DROP COLUMN responsible_name, DROP COLUMN responsible_position, DROP COLUMN responsible_phone,
        DROP COLUMN responsible_email;
    `);
  }
}
