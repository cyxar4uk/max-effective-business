import { describe, expect, it } from 'vitest';
import { employerAction, studentAction } from './interestFsm.js';

describe('studentAction', () => {
  it('создаёт отклик', () => {
    expect(studentAction(null, 'interested')).toEqual({ ok: true, next: 'interested', changed: true });
    expect(studentAction(null, 'skipped')).toEqual({ ok: true, next: 'skipped', changed: true });
  });
  it('повтор идемпотентен', () => {
    expect(studentAction('interested', 'interested')).toEqual({ ok: true, next: 'interested', changed: false });
    expect(studentAction('skipped', 'skipped')).toEqual({ ok: true, next: 'skipped', changed: false });
  });
  it('можно передумать до решения работодателя', () => {
    expect(studentAction('skipped', 'interested')).toMatchObject({ ok: true, changed: true });
    expect(studentAction('interested', 'skipped')).toMatchObject({ ok: true, changed: true });
  });
  it('после решения работодателя статус не меняется', () => {
    for (const s of ['invited', 'declined'] as const) {
      expect(studentAction(s, 'interested').ok).toBe(false);
      expect(studentAction(s, 'skipped').ok).toBe(false);
    }
  });
});

describe('employerAction', () => {
  it('решение только из interested', () => {
    expect(employerAction('interested', 'invited')).toEqual({ ok: true, next: 'invited', changed: true });
    expect(employerAction('interested', 'declined')).toEqual({ ok: true, next: 'declined', changed: true });
    expect(employerAction('skipped', 'invited').ok).toBe(false);
  });
  it('повтор идемпотентен, смена решения запрещена', () => {
    expect(employerAction('invited', 'invited')).toMatchObject({ ok: true, changed: false });
    expect(employerAction('invited', 'declined').ok).toBe(false);
    expect(employerAction('declined', 'invited').ok).toBe(false);
  });
});
