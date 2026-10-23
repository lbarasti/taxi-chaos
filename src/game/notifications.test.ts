import { describe, expect, it } from 'vitest';
import { NotificationStack, type TripReceipt } from './notifications';
import { Game } from './game';
import { calculateFare } from './fare';

describe('notification display time', () => {
  it('keeps separate receipts for equal payouts and snapshots their scores', () => {
    const stack = new NotificationStack();
    const receipt: TripReceipt = { type: 'fare', baseFare: 100, payout: 178, adjustment: 78, speedScore: 75, comfortScore: 60, speedBonus: 60, comfortBonus: 18 };
    stack.push('Fare complete', 'success', { duration: null, receipt });
    stack.push('Fare complete', 'success', { duration: null, receipt });
    receipt.payout = 999;
    expect(stack.items).toHaveLength(2);
    expect(stack.items.map(card => card.receipt?.payout)).toEqual([178, 178]);
  });

  it('preempts newest first and resumes each interrupted countdown', () => {
    const stack = new NotificationStack();
    stack.push('First'); stack.tick(1.5);
    stack.push('Second'); stack.tick(1);
    stack.push('Third'); stack.tick(4);
    expect(stack.current).toMatchObject({ message: 'Second', remaining: 3 });
    stack.tick(3);
    expect(stack.current).toMatchObject({ message: 'First', remaining: 2.5 });
    stack.tick(2.5); expect(stack.items).toEqual([]);
  });

  it('keeps manual cards and covered cards until the user dismisses them', () => {
    const stack = new NotificationStack();
    stack.push('Route'); stack.tick(1);
    stack.push('Newsroom instructions', '', { category: 'newsroom', duration: null });
    stack.tick(60);
    expect(stack.current?.message).toBe('Newsroom instructions');
    stack.push('Fire!', 'danger'); stack.tick(4);
    expect(stack.current?.message).toBe('Newsroom instructions');
    stack.dismiss();
    expect(stack.current).toMatchObject({ message: 'Route', remaining: 3 });
  });

  it('never spends hidden time or carries spare time into an unseen card', () => {
    const stack = new NotificationStack();
    stack.push('Older'); stack.push('Newer');
    stack.tick(50, false);
    expect(stack.current?.remaining).toBe(4);
    stack.tick(50);
    expect(stack.current).toMatchObject({ message: 'Older', remaining: 4 });
  });

  it('coalesces repeated instructions without losing unrelated notifications', () => {
    const stack = new NotificationStack();
    stack.push('Blocked', 'danger'); stack.push('Other'); stack.push('Blocked', 'danger');
    expect(stack.items.map(card => card.message)).toEqual(['Blocked', 'Other']);
    const olderId = stack.items[1].id;
    stack.dismiss(-1); expect(stack.items).toHaveLength(2);
    stack.dismiss(olderId); expect(stack.current?.message).toBe('Blocked');
  });
});

describe('game notification lifecycle', () => {
  it.each([
    { type: 'fare' as const, baseFare: 20, elapsed: 25, comfort: 80, payout: 98, adjustment: 78, speed: 75, comfortScore: 60, speedBonus: 60, comfortBonus: 18 },
    { type: 'parcel' as const, baseFare: 20, elapsed: 25, comfort: 80, payout: 98, adjustment: 78, speed: 75, comfortScore: 60, speedBonus: 60, comfortBonus: 18 },
    { type: 'fare' as const, baseFare: 20, elapsed: 100, comfort: 50, payout: 20, adjustment: 0, speed: 0, comfortScore: 0, speedBonus: 0, comfortBonus: 0 },
    { type: 'fare' as const, baseFare: 100, elapsed: 150, comfort: 0, payout: 30, adjustment: -70, speed: -50, comfortScore: -100, speedBonus: -40, comfortBonus: -30 },
    { type: 'fare' as const, baseFare: 20, elapsed: 150, comfort: 0, payout: 0, adjustment: -70, speed: -50, comfortScore: -100, speedBonus: -40, comfortBonus: -30 },
    { type: 'parcel' as const, baseFare: 20, elapsed: 150, comfort: 0, payout: 0, adjustment: -70, speed: -50, comfortScore: -100, speedBonus: -40, comfortBonus: -30 },
  ])('keeps a $payout completion receipt for a $type with the actual signed adjustments', expected => {
    const game = new Game(undefined, false, false);
    game.vehicles = [game.player]; game.trafficTarget = 0; game.settings.noPolice = true; game.start();
    Object.assign(game.job, { type: expected.type, stage: 'dropoff', wait: 0.8, time: 100, elapsed: expected.elapsed, comfort: expected.comfort, fare: expected.baseFare });
    game.player.body.position = { ...game.job.dropoff }; game.player.body.velocity = { x: 0, y: 0 };
    const cash = game.save.cash;
    game.update(1 / 120);
    expect(game.jobsDone).toBe(1);
    expect(game.save.cash - cash).toBe(expected.payout);
    expect(game.notifications.current).toMatchObject({ remaining: null, kind: 'success', receipt: {
      type: expected.type, baseFare: expected.baseFare, payout: expected.payout, adjustment: expected.adjustment,
      speedScore: expected.speed, comfortScore: expected.comfortScore, speedBonus: expected.speedBonus, comfortBonus: expected.comfortBonus,
    } });
    expect(game.notifications.current?.message).not.toMatch(/Answer Dispatch|Next pickup marked/);
    game.job.comfort = 0;
    expect(game.notifications.current?.receipt?.comfortScore).toBe(expected.comfortScore);
    expect(game.notifications.current?.message).not.toMatch(/\$-|\+-|tips/);
    expect(game.notifications.current?.message.includes('(minimum payout)')).toBe(expected.baseFare + expected.adjustment < 0);
  });

  it('restores a bad story ride and completes it once at zero payout with a matching notebook receipt', () => {
    const source = new Game(undefined, false);
    source.vehicles = [source.player]; source.trafficTarget = 0; source.settings.noPolice = true; source.start();
    source.player.body.position = { ...source.job.pickup }; source.player.body.velocity = { x: 0, y: 0 };
    for (let tick = 0; tick < 108; tick++) source.update(1 / 120);
    expect(source.job.stage).toBe('dropoff');
    const missionId = source.job.missionId!, elapsed = source.job.time + 100;
    source.job.elapsed = elapsed; source.job.comfort = 0; source.save.cash = 400;
    source.shiftEarnings = 17; source.save.shiftStats.earnings = 17;
    const quoted = calculateFare(source.job);
    source.persist();

    const game = new Game(undefined, false, true, source.save);
    game.vehicles = [game.player]; game.trafficTarget = 0; game.settings.noPolice = true; game.start();
    expect(game.job).toMatchObject({ missionId, stage: 'dropoff', elapsed, comfort: 0 });
    expect(calculateFare(game.job)).toEqual(quoted);
    const before = { cash: game.save.cash, deliveries: game.save.deliveries, storyDeliveries: game.save.story.deliveries, earnings: game.shiftEarnings, shift: { ...game.save.shiftStats }, best: game.save.best };
    game.job.wait = 0.8; game.player.body.position = { ...game.job.dropoff }; game.player.body.velocity = { x: 0, y: 0 };
    game.update(1 / 120);
    expect(game.save.cash).toBe(before.cash); expect(game.shiftEarnings).toBe(before.earnings); expect(game.save.shiftStats.earnings).toBe(before.shift.earnings);
    expect(game.save.best).toBe(Math.max(before.best, before.earnings));
    expect(game.jobsDone).toBe(1); expect(game.save.deliveries).toBe(before.deliveries + 1);
    expect(game.save.story.deliveries).toBe(before.storyDeliveries + 1); expect(game.save.shiftStats.jobs).toBe(before.shift.jobs + 1);
    expect(game.save.story.completed.filter(id => id === missionId)).toHaveLength(1);
    const receipt = game.notifications.items.find(card => card.receipt)?.receipt;
    expect(receipt).toMatchObject({ ...quoted, type: 'fare', payout: 0 });
    const notebook = game.save.playerRecords.notebook.find(entry => entry.id === `fare-${before.storyDeliveries + 1}`)!;
    expect(notebook.text).toContain('Paid $0 (minimum payout)');
    expect(notebook.text).toContain('Speed −$'); expect(notebook.text).toContain('Comfort −$30');
    expect(notebook.text).not.toMatch(/\$-|\+-|tips/);
    for (let tick = 0; tick < 108; tick++) game.update(1 / 120);
    expect(game.save.cash).toBe(before.cash); expect(game.jobsDone).toBe(1);
    expect(game.save.story.completed.filter(id => id === missionId)).toHaveLength(1);
    expect(game.save.playerRecords.notebook.filter(entry => entry.id === notebook.id)).toHaveLength(1);
  });

  it.each(['fare', 'parcel'] as const)('starts %s pickup dialogue without adding or replacing notification cards', type => {
    const game = new Game(undefined, false, 'legacy');
    if (type === 'parcel') {
      game.player = game.spawnVehicle({ kind: 'taxi', model: 'motorcycle', position: { x: 4, y: 32 } });
      game.setJobType();
    }
    game.vehicles = [game.player]; game.trafficTarget = 0; game.settings.noPolice = true;
    game.start(); game.notifications.clear();
    game.notify('Keep this newsroom receipt', '', { category: 'newsroom', duration: null });
    const cards = structuredClone(game.notifications.items);
    game.player.body.position = { ...game.job.pickup }; game.player.body.velocity = { x: 0, y: 0 };
    for (let tick = 0; tick < 108; tick++) game.update(1 / 120);
    expect(game.job).toMatchObject({ type, stage: 'dropoff' });
    expect(game.dialogue.active?.message.channel).toBe(type === 'parcel' ? 'sender' : 'passenger');
    expect(game.notifications.items).toEqual(cards);
  });

  it('starts a fresh game without carrying over another game’s notification cards', () => {
    const game = new Game(undefined, false);
    game.start(); game.notify('Newsroom copy submitted', '', { category: 'newsroom', duration: null });
    const next = game.freshGame();
    expect(next.notifications.items).toHaveLength(0);
    expect(game.notifications.current?.message).toBe('Newsroom copy submitted');
  });

  it('pauses display timers with the game and whenever the UI is obscured', () => {
    const game = new Game(undefined, false, false);
    game.start(); game.notifications.clear(); game.notify('Route');
    game.notificationsVisible = false; game.update(0.5);
    expect(game.toastTime).toBe(4);
    game.notificationsVisible = true; game.setMode('paused'); game.update(0.5);
    expect(game.toastTime).toBe(4);
    game.setMode('playing'); game.update(0.5);
    expect(game.toastTime).toBe(3.5);
  });

  it('gives newsroom instructions manual dismissal and route cancellation its own automatic card', () => {
    const game = new Game(undefined, false);
    game.start(); game.navigateNewsroom();
    expect(game.notifications.current).toMatchObject({ category: 'newsroom', remaining: null });
    game.navigateNewsroom();
    expect(game.notifications.current).toMatchObject({ category: 'newsroom', message: 'Back to your driving route.', remaining: 4 });
    game.notifications.tick(4);
    expect(game.notifications.current?.remaining).toBeNull();
    game.resetRun(); expect(game.notifications.items).toHaveLength(0);
  });
});
