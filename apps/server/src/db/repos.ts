import type { DataSource } from 'typeorm';
import type { Repos } from '../app.js';
import { Employer, Skill, StudentProfile, User } from './entities.js';
import { createUsersRepo } from './users.js';

export function createRepos(ds: DataSource): Repos {
  return {
    users: createUsersRepo(ds),

    async savePhone(userId, phone) {
      await ds.getRepository(User).update({ id: userId }, { phone, phoneSavedAt: new Date() });
      return ds.getRepository(User).findOneByOrFail({ id: userId });
    },

    async roles(userId) {
      const [student, employer] = await Promise.all([
        ds.getRepository(StudentProfile).existsBy({ userId }),
        ds.getRepository(Employer).existsBy({ ownerUserId: userId }),
      ]);
      return { student, employer };
    },

    async skillGroups() {
      const skills = await ds.getRepository(Skill).find({ order: { groupName: 'ASC', sort: 'ASC', name: 'ASC' } });
      const groups = new Map<string, { code: string; name: string }[]>();
      for (const s of skills) {
        const list = groups.get(s.groupName) ?? [];
        list.push({ code: s.code, name: s.name });
        groups.set(s.groupName, list);
      }
      return [...groups.entries()].map(([name, items]) => ({ name, skills: items }));
    },

    async ping() {
      await ds.query('SELECT 1');
    },
  };
}
