import { Router } from 'express';
import { currentUser } from '../auth/middleware.js';
import { Employer, StudentProfile } from '../db/entities.js';
import { assertSkills, requireConsent, type DomainDeps } from './context.js';
import { ApiError, parse } from './errors.js';
import { studentProfileBody, employerProfileBody } from './schemas.js';
import { employerView, studentProfileView } from './views.js';

export function profilesRouter({ ds }: DomainDeps): Router {
  const r = Router();
  const students = ds.getRepository(StudentProfile);
  const employers = ds.getRepository(Employer);

  r.get('/student/profile', async (req, res) => {
    const profile = await students.findOneBy({ userId: currentUser(req).id });
    if (!profile) throw new ApiError('NOT_FOUND', 'Анкета ещё не заполнена');
    res.json(studentProfileView(profile));
  });

  r.put('/student/profile', async (req, res) => {
    const user = currentUser(req);
    requireConsent(user);
    const body = parse(studentProfileBody, req.body);
    await assertSkills(ds, { skills: body.skills });
    await students.upsert({ userId: user.id, ...body }, ['userId']);
    res.json(studentProfileView(await students.findOneByOrFail({ userId: user.id })));
  });

  r.get('/employer/profile', async (req, res) => {
    const employer = await employers.findOneBy({ ownerUserId: currentUser(req).id });
    if (!employer) throw new ApiError('NOT_FOUND', 'Профиль компании ещё не заполнен');
    res.json(employerView(employer));
  });

  r.put('/employer/profile', async (req, res) => {
    const user = currentUser(req);
    requireConsent(user);
    const body = parse(employerProfileBody, req.body);
    await employers.upsert({ ownerUserId: user.id, ...body }, ['ownerUserId']);
    res.json(employerView(await employers.findOneByOrFail({ ownerUserId: user.id })));
  });

  return r;
}
