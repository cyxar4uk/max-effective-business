import 'reflect-metadata';
import pg from 'pg';
import { DataSource } from 'typeorm';
import { entities } from './entities.js';
import { Init1790000000000 } from './migrations/1790000000000-Init.js';
import { NotificationQueue1790000000001 } from './migrations/1790000000001-NotificationQueue.js';
import { PlaceFields1790000000002 } from './migrations/1790000000002-PlaceFields.js';
import { UsersMinimalPd1790000000003 } from './migrations/1790000000003-UsersMinimalPd.js';
import { InterestedAt1790000000004 } from './migrations/1790000000004-InterestedAt.js';

// pg по умолчанию отдаёт bigint (int8) строкой. Наши id и count(*) укладываются
// в Number.MAX_SAFE_INTEGER, поэтому читаем их числами.
pg.types.setTypeParser(pg.types.builtins.INT8, (v: string) => Number(v));

export const migrations = [
  Init1790000000000,
  NotificationQueue1790000000001,
  PlaceFields1790000000002,
  UsersMinimalPd1790000000003,
  InterestedAt1790000000004,
];

export function createDataSource(url: string): DataSource {
  return new DataSource({
    type: 'postgres',
    url,
    entities,
    migrations,
    migrationsTransactionMode: 'each',
    synchronize: false,
    logging: false,
    // statement_timeout — предел на стороне БД; query_timeout — на стороне клиента, если БД не отвечает вовсе
    extra: { max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000, query_timeout: 12000 },
  });
}
