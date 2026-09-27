import { Router } from 'express';
import { z } from 'zod';
import { verifyContact } from '../auth/contact.js';
import { currentUser } from '../auth/middleware.js';
import type { Config } from '../config.js';
import type { User } from '../db/entities.js';
import type { Repos } from '../app.js';
import { requireConsent } from './context.js';
import { ApiError, parse } from './errors.js';
import { phoneBody } from './schemas.js';

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

export function apiRouter(repos: Repos, config: Pick<Config, 'MAX_BOT_TOKEN'>): Router {
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

  // Номер из WebApp.requestContact(): сохраняем только если подпись MAX сошлась
  r.post('/me/phone', async (req, res) => {
    const user = currentUser(req);
    requireConsent(user);
    const body = parse(phoneBody, req.body);
    const scheme = verifyContact(body, user.maxUserId, config.MAX_BOT_TOKEN);
    if (!scheme) throw new ApiError('VALIDATION_ERROR', 'Не удалось подтвердить номер. Поделитесь им ещё раз', { phone: 'Подпись номера не сошлась' });
    req.log.info({ contactScheme: scheme }, 'Номер подтверждён');
    const saved = await repos.savePhone(user.id, `+${body.phone.replace(/\D/g, '')}`);
    res.json(meView(saved, await repos.roles(saved.id)));
  });

  r.get('/skills', async (_req, res) => {
    res.json({ groups: await repos.skillGroups() });
  });

  return r;
}
