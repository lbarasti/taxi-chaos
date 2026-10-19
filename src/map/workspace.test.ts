import { describe, expect, it, vi } from 'vitest';
import type { Game } from '../game';
import { vec, type Vec } from '../physics';
import { MapWorkspace, type PreviewFactory, type WorkspaceRenderer } from './workspace';

type FakePreview = Game & { keys: Set<string>; updates: number; time: number };

function fakePreview(position: Vec = vec(10, 20)): FakePreview {
  const preview = {
    actor: { position },
    keys: new Set<string>(),
    updates: 0,
    time: 0,
    update(dt: number) { preview.time += dt; preview.updates++; },
    snapshot: () => ({ mode: 'playing', time: preview.time, position: { ...preview.actor.position } }),
  };
  return preview as unknown as FakePreview;
}

function setup(priorClock = false) {
  const original = { marker: 'original' } as unknown as Game;
  const preview = fakePreview();
  const calls: string[] = [];
  let clock = priorClock;
  const renderer: WorkspaceRenderer = { camera: vec(3, 4), zoom: 2.5, canvas: { focus: vi.fn() } };
  const hooks = {
    clock: () => clock,
    freeze: (value: boolean) => calls.push(`freeze:${value}`),
    clearInput: () => calls.push('clearInput'),
    activate: (game: Game) => calls.push(game === original ? 'activate:original' : 'activate:preview'),
    silence: () => calls.push('silence'),
    lock: (panel: boolean, game: boolean) => calls.push(`lock:${panel}:${game}`),
  };
  const createPreview = vi.fn(((document, spawnId) => { calls.push(`factory:${spawnId}`); return preview; }) as PreviewFactory);
  const workspace = new MapWorkspace(original, renderer, hooks, createPreview);
  return { original, preview, calls, renderer, workspace, createPreview, setClock: (value: boolean) => { clock = value; } };
}

describe('programmatic map workspace lifecycle', () => {
  it('freezes and locks a draft, then restores a live prior clock on close', () => {
    const { calls, renderer, workspace, setClock } = setup(false);
    setClock(false);
    const before = workspace.api.open();
    expect(before.schemaVersion).toBe(4);
    expect(calls).toContain('freeze:true');
    expect(calls).toContain('lock:true:true');

    renderer.camera = vec(99, 100); renderer.zoom = 8;
    workspace.api.close();
    expect(renderer.camera).toEqual(vec(3, 4));
    expect(renderer.zoom).toBe(2.5);
    expect(calls).toContain('freeze:false');
    expect(calls.at(-1)).toBe('lock:false:false');
    expect(renderer.canvas.focus).toHaveBeenCalledOnce();
  });

  it('restores a previously frozen clock on close without reintroducing editor state', () => {
    const { calls, renderer, workspace } = setup(true);
    workspace.api.open();
    workspace.api.close();
    expect(calls).toContain('freeze:true');
    expect(calls).not.toContain('freeze:false');
    expect(calls.at(-1)).toBe('lock:false:false');
    expect(renderer.canvas.focus).toHaveBeenCalledOnce();
  });

  it('injects and steps an isolated preview, then edit freezes while close restores', () => {
    const { calls, preview, renderer, workspace, createPreview } = setup(false);
    workspace.api.open();
    const document = workspace.api.snapshot().document;
    const opened = workspace.api.preview({ spawnId: 'fairway-club' });
    expect(createPreview).toHaveBeenCalledWith(document, 'fairway-club');
    expect(calls).toEqual(expect.arrayContaining(['activate:preview', 'freeze:false', 'lock:true:false']));
    expect(renderer.camera).toEqual(vec(10, 20));
    expect(opened.time).toBe(0);

    calls.length = 0;
    const stepped = workspace.api.step(0.5, ['KeyW']);
    expect(preview.updates).toBe(60);
    expect(preview.keys.size).toBe(0);
    expect(calls).toEqual(['freeze:true']);
    expect(stepped.time).toBeCloseTo(0.5);
    workspace.api.live();
    expect(calls.at(-1)).toBe('freeze:false');

    calls.length = 0;
    workspace.api.edit();
    expect(calls).toEqual(expect.arrayContaining(['activate:original', 'freeze:true', 'lock:true:true']));
    expect(workspace.api.previewState()).toBeNull();
    expect(renderer.camera).toEqual(vec(3, 4));
    expect(renderer.zoom).toBe(2.5);

    calls.length = 0;
    workspace.api.close();
    expect(calls).toContain('freeze:false');
    expect(calls.at(-1)).toBe('lock:false:false');
  });

  it('returns from edit to a prior frozen clock only on close', () => {
    const { calls, workspace } = setup(true);
    workspace.api.open(); workspace.api.preview(); calls.length = 0;
    workspace.api.edit();
    expect(calls).toContain('freeze:true');
    expect(calls).toContain('lock:true:true');
    calls.length = 0;
    workspace.api.close();
    expect(calls).toContain('freeze:true');
    expect(calls).not.toContain('freeze:false');
    expect(calls.at(-1)).toBe('lock:false:false');
  });

  it('round-trips document operations and rejects apply/undo/redo while previewing', () => {
    const { workspace } = setup();
    const opened = workspace.api.open();
    const exported = workspace.api.export();
    const added = workspace.api.apply({ baseRevision: opened.revision, operations: [{
      type: 'add', collection: 'countryProps',
      descriptor: { id: 'workspace-bakery', owner: 'southern-estates', position: vec(166, 450), kind: 'building', angle: 0, color: '#426e58', label: '', type: 'bakery' },
    }] });
    expect(added.changedIds).toContain('workspace-bakery');
    const bounds = workspace.api.describe('workspace-bakery').bounds!;
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(12);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(8);
    expect(workspace.api.validate().errors).toBe(0);

    workspace.api.undo();
    expect(workspace.api.snapshot().document.countryProps.some(p => p.id === 'workspace-bakery')).toBe(false);
    workspace.api.redo();
    expect(workspace.api.snapshot().document.countryProps.some(p => p.id === 'workspace-bakery')).toBe(true);

    const imported = workspace.api.import(exported);
    expect(imported.revision).toBe(opened.revision);
    expect(workspace.api.export()).toBe(exported);
    expect(workspace.api.select('southern-estates').kind).toBe('district');

    workspace.api.preview();
    expect(() => workspace.api.apply({ baseRevision: workspace.api.snapshot().revision, operations: [] })).toThrow(/Return to editing/);
    expect(() => workspace.api.undo()).toThrow(/Return to editing/);
    expect(() => workspace.api.redo()).toThrow(/Return to editing/);
    expect(() => workspace.api.import(exported)).toThrow(/Return to editing/);
  });

  it('leaves the prior camera untouched when open is repeated', () => {
    const { renderer, workspace } = setup();
    workspace.api.open();
    renderer.camera = vec(50, 60); renderer.zoom = 4;
    workspace.api.open();
    workspace.api.close();
    expect(renderer.camera).toEqual(vec(3, 4));
    expect(renderer.zoom).toBe(2.5);
  });
});
