import { describe, expect, it } from 'vitest';
import { interestIdFromParam, placeIdFromParam } from './placeParam';

describe('параметр запуска', () => {
  it('docs_<id> — id отклика для документов практики', () => {
    expect(interestIdFromParam('docs_42')).toBe(42);
    expect(interestIdFromParam('docs_0')).toBeNull();
    expect(interestIdFromParam('docs_')).toBeNull();
    expect(interestIdFromParam('docs_12a')).toBeNull();
    expect(interestIdFromParam('docs_99999999999')).toBeNull();
    expect(interestIdFromParam('internship_42')).toBeNull();
    expect(interestIdFromParam('')).toBeNull();
  });

  it('internship_<id> и docs_<id> не путаются', () => {
    expect(placeIdFromParam('docs_42')).toBeNull();
    expect(placeIdFromParam('internship_42')).toBe(42);
  });
});
