import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSkipQueue } from './skipQueue';

const DELAY = 8000;

const deferred = () => {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('отложенные пропуски мест', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('пропуск не уходит на сервер сразу', () => {
    const send = vi.fn(() => Promise.resolve());
    const skips = createSkipQueue(send, DELAY);
    skips.add(1);
    vi.advanceTimersByTime(DELAY - 1);
    expect(send).not.toHaveBeenCalled();
  });

  it('пропуск без «Вернуть» сохраняется: уходит через задержку', () => {
    const send = vi.fn(() => Promise.resolve());
    const skips = createSkipQueue(send, DELAY);
    skips.add(1);
    vi.advanceTimersByTime(DELAY);
    expect(send.mock.calls).toEqual([[1, false]]);
  });

  it('«Вернуть» и уход с экрана — место не пропущено на сервере', () => {
    const send = vi.fn(() => Promise.resolve());
    const skips = createSkipQueue(send, DELAY);
    skips.add(1);
    expect(skips.remove(1)).toBe(true);
    expect(skips.flush(true)).toBe(false);
    vi.advanceTimersByTime(DELAY * 2);
    expect(send).not.toHaveBeenCalled();
  });

  it('уход с экрана отправляет отложенное сразу, в порядке пропусков и с keepalive', () => {
    const send = vi.fn(() => Promise.resolve());
    const skips = createSkipQueue(send, DELAY);
    skips.add(3);
    skips.add(1);
    skips.add(2);
    skips.remove(1);
    expect(skips.flush(true)).toBe(true);
    expect(send.mock.calls).toEqual([
      [3, true],
      [2, true],
    ]);
    // Таймеры отправленных сняты: второй раз не уходят
    vi.advanceTimersByTime(DELAY * 2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('отправленный пропуск не возвращается, а колода узнаёт о нём', () => {
    const send = vi.fn(() => Promise.resolve());
    const skips = createSkipQueue(send, DELAY);
    const sent = vi.fn();
    const unsubscribe = skips.subscribe(sent);
    skips.add(1);
    vi.advanceTimersByTime(DELAY);
    expect(sent).toHaveBeenCalledWith([1]);
    expect(skips.remove(1)).toBe(false);
    expect(skips.flush(false)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);

    unsubscribe();
    skips.add(2);
    skips.flush(true);
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it('вернули и снова пропустили — уходит один раз, отсчёт заново', () => {
    const send = vi.fn(() => Promise.resolve());
    const skips = createSkipQueue(send, DELAY);
    skips.add(1);
    vi.advanceTimersByTime(DELAY - 1000);
    skips.remove(1);
    skips.add(1);
    vi.advanceTimersByTime(DELAY - 1);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send.mock.calls).toEqual([[1, false]]);
  });

  it('лента ждёт ответов на отправленные пропуски, в том числе с ошибкой', async () => {
    const first = deferred();
    const second = deferred();
    const send = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const skips = createSkipQueue(send, DELAY);
    skips.add(1);
    skips.add(2);
    skips.flush(true);

    let done = false;
    const waiting = skips.settled(60_000).then(() => {
      done = true;
    });
    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);

    second.reject(new Error('нет сети'));
    await waiting;
    expect(done).toBe(true);
  });

  it('повисший запрос держит ленту не дольше предела', async () => {
    const skips = createSkipQueue(() => new Promise(() => undefined), DELAY);
    skips.add(1);
    skips.flush(true);

    let done = false;
    const waiting = skips.settled(3000).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(done).toBe(true);
  });

  it('сбой одного запроса не мешает отправить остальные', async () => {
    const send = vi.fn((id: number) => {
      if (id === 1) throw new Error('сбой');
      return Promise.resolve();
    });
    const skips = createSkipQueue(send, DELAY);
    skips.add(1);
    skips.add(2);
    expect(skips.flush(true)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    const waiting = skips.settled(60_000);
    await vi.advanceTimersByTimeAsync(0);
    await expect(waiting).resolves.toBeUndefined();
  });
});
