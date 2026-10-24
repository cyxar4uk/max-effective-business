import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tls from 'node:tls';
import { describe, expect, it } from 'vitest';
import { RUSSIAN_TRUSTED_ROOT_CA, RUSSIAN_TRUSTED_ROOT_CA_SHA256, trustRussianRootCa } from './russianRootCa.js';

describe('корень Минцифры для MAX Bot API', () => {
  const cert = new X509Certificate(RUSSIAN_TRUSTED_ROOT_CA);

  it('это Russian Trusted Root CA с опубликованным отпечатком, самоподписанный корень', () => {
    expect(cert.subject).toContain('CN=Russian Trusted Root CA');
    expect(cert.issuer).toBe(cert.subject);
    expect(cert.ca).toBe(true);
    expect(cert.fingerprint256).toBe(RUSSIAN_TRUSTED_ROOT_CA_SHA256);
  });

  it('файл для curl (deploy/russian_trusted_root_ca.crt) — тот же сертификат', () => {
    const file = readFileSync(fileURLToPath(new URL('../../../../deploy/russian_trusted_root_ca.crt', import.meta.url)), 'utf8');
    expect(new X509Certificate(file).fingerprint256).toBe(RUSSIAN_TRUSTED_ROOT_CA_SHA256);
  });

  it('действует ещё не меньше года', () => {
    expect(new Date(cert.validTo).getTime()).toBeGreaterThan(Date.now() + 365 * 24 * 3600_000);
  });

  // tls.setDefaultCACertificates появился в Node 24.5: на более старом Node проверять нечего (#102)
  it.skipIf(typeof tls.setDefaultCACertificates !== 'function')('после вызова — среди доверенных по умолчанию, стандартные корни на месте, повторный вызов ничего не меняет', () => {
    const subjects = () => tls.getCACertificates('default').map((pem) => new X509Certificate(pem));
    expect(trustRussianRootCa()).toBe(true);
    const after = subjects();
    expect(after.some((c) => c.fingerprint256 === RUSSIAN_TRUSTED_ROOT_CA_SHA256)).toBe(true);
    // Стандартный корень (Let's Encrypt) не потерялся — обычные сайты по-прежнему проверяются
    expect(after.some((c) => c.subject.includes('CN=ISRG Root X1'))).toBe(true);
    expect(trustRussianRootCa()).toBe(true);
    expect(subjects().length).toBe(after.length);
  });
});
