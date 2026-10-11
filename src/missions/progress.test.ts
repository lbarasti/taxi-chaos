import { describe, expect, it } from 'vitest';
import { clearMissionProgress, cloneMissionProgress, defaultMissionProgress, migrateMissionProgress } from './progress';

describe('mission progress migration', () => {
  it('defaults a fresh story', () => {
    expect(defaultMissionProgress()).toEqual({ version: 1, chapter: 1, completed: [], failed: [], flags: [], choices: {}, relationships: {}, campaignSeconds: 0, deliveries: 0, retryAt: {} });
  });

  it('defaults legacy saves that have no story field', () => {
    expect(migrateMissionProgress(undefined)).toEqual(defaultMissionProgress());
    expect(migrateMissionProgress(null)).toEqual(defaultMissionProgress());
    expect(migrateMissionProgress({ cash: 120 })).toEqual(defaultMissionProgress());
  });

  it('falls back for unknown future versions instead of corrupting progress', () => {
    expect(migrateMissionProgress({ version: 2, chapter: 9, completed: ['x'] })).toEqual(defaultMissionProgress());
  });

  it('loads and sanitises valid progress', () => {
    const loaded = migrateMissionProgress({
      version: 1, chapter: 3.9,
      completed: ['mia-meridian-lead', 'mia-meridian-lead', 'Bad Id', 7],
      failed: ['dead-end'], flags: ['met-mia', 'met-mia'], choices: { route: 'fast', 'Bad Key': 'ok', good: 'Bad Value' },
      relationships: { mia: 4, ghost: 2000, nan: Number.NaN },
    });
    expect(loaded.chapter).toBe(3);
    expect(loaded.completed).toEqual(['mia-meridian-lead']);
    expect(loaded.flags).toEqual(['met-mia']);
    expect(loaded.choices).toEqual({ route: 'fast' });
    expect(loaded.relationships).toEqual({ mia: 4, ghost: 1000 });
  });

  it('resets progress in place so holders stay in sync', () => {
    const progress = migrateMissionProgress({ version: 1, chapter: 4, completed: ['a'], flags: ['f'], choices: { g: 'o' }, relationships: { mia: 2 } });
    const reference = progress;
    clearMissionProgress(progress);
    expect(progress).toBe(reference);
    expect(progress).toEqual(defaultMissionProgress());
  });

  it('produces detached clones', () => {
    const progress = defaultMissionProgress();
    progress.completed.push('a'); progress.choices.g = 'o'; progress.relationships.mia = 1;
    const clone = cloneMissionProgress(progress);
    clone.completed.push('b'); clone.choices.g = 'other'; clone.relationships.mia = 99;
    expect(progress.completed).toEqual(['a']);
    expect(progress.choices.g).toBe('o');
    expect(progress.relationships.mia).toBe(1);
  });

  it('migrates old progress without borrowing career counts and sanitises campaign state', () => {
    const old = migrateMissionProgress({ version: 1, completed: ['intro'] });
    expect(old.completed).toEqual(['intro']);
    expect(old.deliveries).toBe(0);
    expect(old.campaignSeconds).toBe(0);
    const loaded = migrateMissionProgress({ version: 1, campaignSeconds: 42, deliveries: 3.9, retryAt: { intro: 60, bad: -1, nan: NaN, 'Bad ID': 20 } });
    expect(loaded.deliveries).toBe(3);
    expect(loaded.retryAt).toEqual({ intro: 60 });
    const clone = cloneMissionProgress(loaded);
    clone.retryAt.intro = 999;
    expect(loaded.retryAt.intro).toBe(60);
    clearMissionProgress(loaded);
    expect(loaded).toEqual(defaultMissionProgress());
  });
});
