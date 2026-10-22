import { describe, expect, it } from 'vitest';
import { NotificationStack } from './notifications';
import { Game } from './game';

describe('notification display time', () => {
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
