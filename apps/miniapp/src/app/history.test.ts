import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavigateFunction } from 'react-router';

// Модуль хранит адреса записей в памяти — на каждый тест свежий экземпляр и своё окно с историей
type Listener = () => void;
let idx = 0;
let popListeners: Listener[] = [];

beforeEach(() => {
  vi.resetModules();
  idx = 0;
  popListeners = [];
  vi.stubGlobal('window', {
    history: {
      get state() {
        return { idx };
      },
    },
    addEventListener: (type: string, listener: Listener) => {
      if (type === 'popstate') popListeners.push(listener);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Пройти по адресам, как пушит роутер: каждый — новая запись. */
async function visit(...paths: string[]) {
  const history = await import('./history');
  paths.forEach((path, i) => {
    idx = i;
    history.rememberEntry(path);
  });
  return history;
}

const fakeNavigate = () => vi.fn() as unknown as NavigateFunction & ReturnType<typeof vi.fn>;

describe('backTo — переход без дубля в истории', () => {
  it('главный позади — возврат к нему, а не второй главный', async () => {
    const { backTo } = await visit('/', '/consent');
    const navigate = fakeNavigate();
    backTo(navigate, '/');
    expect(navigate.mock.calls).toEqual([[-1]]);
  });

  it('из колоды в место и обратно — возврат в ленту через несколько записей', async () => {
    const { backTo } = await visit('/', '/student', '/internships/5', '/internships/7');
    const navigate = fakeNavigate();
    backTo(navigate, '/student');
    expect(navigate.mock.calls).toEqual([[-2]]);
  });

  it('адреса позади нет — замена текущей записи', async () => {
    const { backTo } = await visit('/internships/5');
    const navigate = fakeNavigate();
    backTo(navigate, '/student');
    expect(navigate.mock.calls).toEqual([['/student', { replace: true }]]);
  });

  it('позади другая вкладка раздела — возврат к ней, потом замена адреса', async () => {
    const { backTo, STUDENT_TABS } = await visit('/', '/student/interests', '/internships/5');
    const navigate = fakeNavigate();
    backTo(navigate, '/student', STUDENT_TABS);
    expect(navigate.mock.calls).toEqual([[-1]]);
    expect(popListeners).toHaveLength(1);
    idx = 1;
    popListeners[0]();
    expect(navigate.mock.calls).toEqual([[-1], ['/student', { replace: true }]]);
  });

  it('записи после текущей не считаются: их стёр новый переход', async () => {
    const history = await visit('/', '/student', '/internships/5');
    // «Назад» на главный, потом новый переход — запись 1 теперь другая
    idx = 1;
    history.rememberEntry('/about');
    const navigate = fakeNavigate();
    history.backTo(navigate, '/student');
    expect(navigate.mock.calls).toEqual([['/student', { replace: true }]]);
  });
});
