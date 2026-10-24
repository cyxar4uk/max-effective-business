import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interest } from '../../api/types';
import { createInviteWatcher } from './invitePoll';

const interest = (id: number, status: Interest['status']) =>
  ({ status, internship: { id, company: { name: 'Кофейня' } } }) as unknown as Interest;

describe('createInviteWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('спрашивает раз в 3 с и сообщает о приглашении один раз', async () => {
    let status: Interest['status'] = 'interested';
    const load = vi.fn(async () => [interest(7, status), interest(8, 'invited')]);
    const onInvited = vi.fn();
    const w = createInviteWatcher({ load, onInvited, now: Date.now });
    w.watch(7);
    expect(load).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(onInvited).not.toHaveBeenCalled();

    status = 'invited';
    await vi.advanceTimersByTimeAsync(3000);
    expect(onInvited).toHaveBeenCalledTimes(1);
    // Место 8 не наблюдали — о нём не говорим
    expect(onInvited.mock.calls[0][0].internship.id).toBe(7);

    // Больше наблюдать нечего — опрос остановился
    await vi.advanceTimersByTimeAsync(9000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('перестаёт спрашивать через 45 с без приглашения и переживает ошибки сети', async () => {
    const load = vi.fn(async (): Promise<Interest[]> => {
      if (load.mock.calls.length === 1) throw new Error('offline');
      return [interest(7, 'interested')];
    });
    const w = createInviteWatcher({ load, onInvited: vi.fn(), now: Date.now });
    w.watch(7);
    await vi.advanceTimersByTimeAsync(60000);
    expect(load).toHaveBeenCalledTimes(15);
  });

  it('один запрос на несколько мест; stop снимает опрос, watch запускает снова', async () => {
    const load = vi.fn(async () => [] as Interest[]);
    const w = createInviteWatcher({ load, onInvited: vi.fn(), now: Date.now });
    w.watch(1);
    w.watch(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(load).toHaveBeenCalledTimes(1);
    w.stop();
    await vi.advanceTimersByTimeAsync(9000);
    expect(load).toHaveBeenCalledTimes(1);
    w.watch(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
