import type { DataSource } from 'typeorm';
import type { MaxUser } from '../auth/initData.js';
import { User } from './entities.js';

export interface UsersRepo {
  upsertFromMax(maxUser: MaxUser): Promise<User>;
  saveConsent(userId: number, version: string): Promise<User>;
}

export function createUsersRepo(ds: DataSource): UsersRepo {
  const repo = ds.getRepository(User);
  return {
    // Имя и ник обновляются, если пользователь сменил их в MAX. Пишем в БД только при изменениях.
    async upsertFromMax(maxUser) {
      const fields = {
        firstName: maxUser.first_name ?? null,
        lastName: maxUser.last_name ?? null,
        username: maxUser.username ?? null,
      };
      const existing = await repo.findOneBy({ maxUserId: maxUser.id });
      if (existing) {
        const changed = (Object.keys(fields) as (keyof typeof fields)[]).some((k) => existing[k] !== fields[k]);
        if (!changed) return existing;
        await repo.update({ id: existing.id }, fields);
        return Object.assign(existing, fields);
      }
      // Два первых запроса одного пользователя могут прийти одновременно
      await repo.createQueryBuilder().insert().values({ maxUserId: maxUser.id, ...fields }).orIgnore().execute();
      return repo.findOneByOrFail({ maxUserId: maxUser.id });
    },

    async saveConsent(userId, version) {
      await repo.update({ id: userId }, { consentAt: new Date(), consentVersion: version });
      return repo.findOneByOrFail({ id: userId });
    },
  };
}
