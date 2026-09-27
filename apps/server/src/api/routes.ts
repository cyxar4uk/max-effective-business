import { Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../auth/middleware.js';
import type { User } from '../db/entities.js';
import type { Repos } from '../app.js';
import { parse } from './errors.js';

// Текущая версия текста согласия на обработку ПД
export const CONSENT_VERSION = '2026-09-27';

function meView(user: User, roles: { student: boolean; employer: boolean }) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    hasPhone: user.phone !== null,
    consent: user.consentAt ? { at: user.consentAt.toISOString(), version: user.consentVersion } : null,
    roles,
  };
}

export function apiRouter(repos: Repos): Router {
  const r = Router();

  r.get('/me', async (req, res) => {
    const user = currentUser(req);
    res.json(meView(user, await repos.roles(user.id)));
  });

  r.post('/me/consent', async (req, res) => {
    const body = parse(z.object({ version: z.literal(CONSENT_VERSION, { error: 'Устаревшая версия согласия' }) }), req.body);
    const user = await repos.users.saveConsent(currentUser(req).id, body.version);
    res.json(meView(user, await repos.roles(user.id)));
  });

  r.get('/skills', async (_req, res) => {
    res.json({ groups: await repos.skillGroups() });
  });

  return r;
}
