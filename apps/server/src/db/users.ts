import type { DataSource } from 'typeorm';
import type { MaxUser } from '../auth/initData.js';
import { User } from './entities.js';

export interface UsersRepo {
  upsertFromMax(maxUser: MaxUser): Promise<User>;
  // Фамилию берём из данных запуска в момент согласия: до него храним только id MAX и имя
  saveConsent(userId: number, version: string, lastName?: string | null): Promise<User>;
}

export function createUsersRepo(ds: DataSource): UsersRepo {
  const repo = ds.getRepository(User);
  return {
    // До согласия на обработку ПД храним только id MAX и имя (для обращения). Фамилию — только после согласия;
    // ник MAX не храним вовсе. Пишем в БД только при изменениях.
    async upsertFromMax(maxUser) {
      const firstName = maxUser.first_name ?? null;
      const existing = await repo.findOneBy({ maxUserId: maxUser.id });
      if (existing) {
        const fields: Partial<Pick<User, 'firstName' | 'lastName'>> = {};
        if (existing.firstName !== firstName) fields.firstName = firstName;
        const lastName = maxUser.last_name ?? null;
        if (existing.consentAt && existing.lastName !== lastName) fields.lastName = lastName;
        if (!Object.keys(fields).length) return existing;
        await repo.update({ id: existing.id }, fields);
        return Object.assign(existing, fields);
      }
      // Два первых запроса одного пользователя могут прийти одновременно
      await repo.createQueryBuilder().insert().values({ maxUserId: maxUser.id, firstName }).orIgnore().execute();
      return repo.findOneByOrFail({ maxUserId: maxUser.id });
    },

    async saveConsent(userId, version, lastName) {
      await repo.update({ id: userId }, { consentAt: new Date(), consentVersion: version, ...(lastName !== undefined ? { lastName } : {}) });
      return repo.findOneByOrFail({ id: userId });
    },
  };
}
