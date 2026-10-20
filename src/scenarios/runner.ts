import { Game, type Mode } from '../game';
import { defaultCompiledMap } from '../map/compile';
import { previewInputs } from '../missions/dialogue-preview';
import { parseMissionProgress } from '../missions/progress';
import { parsePlayerRecords } from '../narrative/player-records';
import { parseCampaign } from '../campaign/state';
import { CAMPAIGN_END, CAMPAIGN_START, dayMinute } from '../campaign/clock';
import { campaignDefinition } from '../campaign/content';
import type { Allegation } from '../campaign/model';
import { GARAGE } from '../world/world';
import { vec, type Vec } from '../physics';

export type ScenarioOptions = { traffic?: 'quiet' | 'normal'; noPolice?: boolean };
export type CaptureView = 'world' | 'notebook' | 'texts' | 'story' | 'pause';
export type CaptureFrame = { focus?: string; zoom?: number };
type Time = { day: number; hour?: number; minute?: number };
type Facts = { flags?: Record<string, boolean>; choices?: Record<string, string>; cash?: number; heat?: number; health?: number };
export type ScenarioCommand = (
  | { op: 'facts'; facts: Facts }
  | { op: 'advance'; minutes?: number; to?: Time; event?: string }
  | { op: 'place'; at: string | Vec; angle?: number }
  | { op: 'step'; seconds: number; keys?: string[] }
  | { op: 'mode'; mode: Mode }
  | { op: 'route'; mission: string; expected?: boolean }
  | { op: 'pickup' | 'deliver' | 'read' | 'ordinary' | 'abandon' | 'reload' }
  | { op: 'photo'; observation?: string; expected?: boolean }
  | { op: 'sleep'; expected?: boolean }
  | { op: 'submit'; material: string; expected?: boolean }
  | { op: 'publish'; allegation: Allegation; expected?: boolean }
  | { op: 'expect'; path: string; equals?: unknown; includes?: unknown; length?: number; exists?: boolean; gte?: number; lte?: number }
  | ({ op: 'capture'; name: string; view?: CaptureView; panelOnly?: boolean } & CaptureFrame)
) & { label?: string };
export type Scenario = { version: 1; name: string; options?: ScenarioOptions; steps: ScenarioCommand[] };

const modes: Mode[] = ['intro', 'playing', 'paused', 'garage', 'arrested', 'wasted'];
const views: CaptureView[] = ['world', 'notebook', 'texts', 'story', 'pause'];
const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft'];
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
};
function fields(value: Record<string, unknown>, allowed: string[]) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown field: ${key}`);
}
function number(value: unknown, name: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) throw new Error(`${name} must be ${integer ? 'an integer' : 'a number'} in [${min}, ${max}]`);
  return value;
}
function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error(`${name} must be a nonempty string (at most 200 characters)`);
  return value;
}
function point(value: unknown): Vec {
  const p = object(value); fields(p, ['x', 'y']);
  return { x: number(p.x, 'x', -2000, 2000), y: number(p.y, 'y', -2000, 2000) };
}
function calendar(value: unknown): number {
  const t = object(value); fields(t, ['day', 'hour', 'minute']);
  return dayMinute(number(t.day, 'day', 1, 15, true), number(t.hour ?? 7, 'hour', 0, 23, true), number(t.minute ?? 0, 'minute', 0, 59, true));
}

export function parseOptions(value: unknown = {}): ScenarioOptions {
  const o = object(value); fields(o, ['traffic', 'noPolice']);
  if (o.traffic !== undefined && !['quiet', 'normal'].includes(o.traffic as string)) throw new Error('traffic must be quiet or normal');
  if (o.noPolice !== undefined && typeof o.noPolice !== 'boolean') throw new Error('noPolice must be boolean');
  return structuredClone(o) as ScenarioOptions;
}

/** Reject misspelled commands/fields before any state is changed. No executable input. */
export function parseCommand(value: unknown): ScenarioCommand {
  const c = object(value), op = string(c.op, 'op');
  const allowed: Record<string, string[]> = {
    facts: ['facts'], advance: ['minutes', 'to', 'event'], place: ['at', 'angle'], step: ['seconds', 'keys'], mode: ['mode'],
    route: ['mission', 'expected'], pickup: [], deliver: [], read: [], ordinary: [], abandon: [], reload: [],
    photo: ['observation', 'expected'], sleep: ['expected'], submit: ['material', 'expected'], publish: ['allegation', 'expected'],
    expect: ['path', 'equals', 'includes', 'length', 'exists', 'gte', 'lte'], capture: ['name', 'view', 'panelOnly', 'focus', 'zoom'],
  };
  if (!Object.hasOwn(allowed, op)) throw new Error(`Unknown command: ${op}`);
  fields(c, ['op', 'label', ...allowed[op]]);
  if (c.label !== undefined) string(c.label, 'label');
  if (c.expected !== undefined && typeof c.expected !== 'boolean') throw new Error('expected must be boolean');
  if (op === 'facts') {
    const f = object(c.facts); fields(f, ['flags', 'choices', 'cash', 'heat', 'health']);
    if (f.flags !== undefined) for (const [id, enabled] of Object.entries(object(f.flags))) { string(id, 'flag'); if (typeof enabled !== 'boolean') throw new Error(`Flag ${id} must be boolean`); }
    if (f.choices !== undefined) for (const [id, choice] of Object.entries(object(f.choices))) { string(id, 'choice group'); string(choice, 'choice'); }
    if (f.cash !== undefined) number(f.cash, 'cash', 0, 1e7);
    if (f.heat !== undefined) number(f.heat, 'heat', 0, 100);
    if (f.health !== undefined) number(f.health, 'health', 0, 100);
  }
  if (op === 'advance') {
    if (['minutes', 'to', 'event'].filter(key => Object.hasOwn(c, key)).length !== 1) throw new Error('advance requires exactly one of minutes, to, event');
    if (c.minutes !== undefined) number(c.minutes, 'minutes', 0, CAMPAIGN_END);
    if (c.to !== undefined) calendar(c.to);
    if (c.event !== undefined) string(c.event, 'event');
  }
  if (op === 'place') { if (typeof c.at === 'string') string(c.at, 'at'); else point(c.at); if (c.angle !== undefined) number(c.angle, 'angle', -Math.PI * 2, Math.PI * 2); }
  if (op === 'step') {
    number(c.seconds, 'seconds', 0, 30);
    if (c.keys !== undefined && (!Array.isArray(c.keys) || c.keys.length > keys.length || c.keys.some(key => !keys.includes(key)))) throw new Error(`keys must contain only: ${keys.join(', ')}`);
  }
  if (op === 'mode' && !modes.includes(c.mode as Mode)) throw new Error(`mode must be one of: ${modes.join(', ')}`);
  if (op === 'route') string(c.mission, 'mission');
  if (op === 'photo' && c.observation !== undefined && !campaignDefinition.observations.some(o => o.id === c.observation)) throw new Error('Unknown observation');
  if (op === 'submit') string(c.material, 'material');
  if (op === 'publish' && !Object.hasOwn(campaignDefinition.claims, c.allegation as string)) throw new Error('Unknown allegation');
  if (op === 'expect') {
    const path = string(c.path, 'path');
    if (!/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(path)) throw new Error('path must use dotted property names or array indices');
    if (['equals', 'includes', 'length', 'exists', 'gte', 'lte'].filter(key => Object.hasOwn(c, key)).length !== 1) throw new Error('expect requires exactly one comparison');
    if (c.length !== undefined) number(c.length, 'length', 0, 1e7, true);
    if (c.exists !== undefined && typeof c.exists !== 'boolean') throw new Error('exists must be boolean');
    for (const key of ['gte', 'lte']) if (c[key] !== undefined) number(c[key], key, -1e9, 1e9);
  }
  if (op === 'capture') {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(string(c.name, 'name'))) throw new Error('capture name must be a lowercase filename stem (letters, digits, hyphens)');
    if (c.view !== undefined && !views.includes(c.view as CaptureView)) throw new Error(`view must be one of: ${views.join(', ')}`);
    if (c.panelOnly !== undefined && typeof c.panelOnly !== 'boolean') throw new Error('panelOnly must be boolean');
    if (c.panelOnly && (c.view === undefined || c.view === 'world')) throw new Error('panelOnly requires a panel view');
    if (c.focus !== undefined && !['actor', ...Object.keys(campaignDefinition.sites)].includes(c.focus as string)) throw new Error('focus must be actor or an authored campaign site');
    if (c.zoom !== undefined) number(c.zoom, 'zoom', 5, 24);
  }
  return structuredClone(c) as ScenarioCommand;
}

export function parseScenario(value: unknown): Scenario {
  const s = object(value); fields(s, ['version', 'name', 'options', 'steps']);
  if (s.version !== 1) throw new Error('Scenario version must be 1');
  string(s.name, 'name');
  if (!Array.isArray(s.steps) || !s.steps.length || s.steps.length > 500) throw new Error('steps must contain 1–500 commands');
  const steps = s.steps.map((step, index) => { try { return parseCommand(step); } catch (e) { throw new Error(`Step ${index + 1}: ${(e as Error).message}`); } });
  const names = steps.filter((c): c is Extract<ScenarioCommand, { op: 'capture' }> => c.op === 'capture').map(c => c.name);
  if (new Set(names).size !== names.length) throw new Error('Capture names must be unique');
  return { version: 1, name: s.name as string, options: parseOptions(s.options), steps };
}

export class ScenarioRunner {
  game: Game;
  private physicsSeconds = 0;
  private count = 0;
  private captures = new Set<string>();
  readonly options: Required<ScenarioOptions>;
  constructor(options: ScenarioOptions = {}) {
    this.options = { traffic: 'quiet', noPolice: true, ...parseOptions(options) };
    this.game = new Game(defaultCompiledMap, false);
    this.configure(); this.game.start(); this.game.toastTime = 0;
  }
  private configure() {
    // Quiet mode removes ambient vehicles, retaining the cab and authored campaign vehicles.
    if (this.options.traffic === 'quiet') { this.game.vehicles = this.game.vehicles.filter(v => v === this.game.player || this.game.isCampaignVehicle(v.sourceId)); this.game.trafficTarget = 0; }
    this.game.configure({ noPolice: this.options.noPolice });
  }
  inputs() {
    return { ...previewInputs(this.game.missions.catalogue), materials: Object.keys(this.game.campaignContent.materials), allegations: Object.keys(this.game.campaignContent.claims),
      events: this.game.campaignContent.operations.map(op => ({ id: op.id, at: op.at })), places: ['pickup', 'dropoff', 'garage', 'newsroom', ...this.game.missions.catalogue.stops.order],
      keys, options: this.options, limits: { commands: 500, secondsPerStep: 30, totalPhysicsSeconds: 120 },
      commands: ['facts', 'advance', 'place', 'step', 'mode', 'route', 'pickup', 'deliver', 'read', 'ordinary', 'abandon', 'reload', 'photo', 'sleep', 'submit', 'publish', 'expect', 'capture'] };
  }
  snapshot() {
    return { ...this.game.snapshot(), flags: [...this.game.save.story.flags], choices: { ...this.game.save.story.choices },
      completed: [...this.game.save.story.completed], failed: [...this.game.save.story.failed], notebookIds: this.game.save.playerRecords.notebook.map(e => e.id),
      materialIds: this.game.save.playerRecords.notebook.filter(e => Object.hasOwn(this.game.campaignContent.materials, e.id)).map(e => e.id),
      sleepReason: this.game.sleepReason, physicsSeconds: this.physicsSeconds };
  }
  private present() { if (this.game.mode === 'playing' && !this.game.onFoot && !this.game.player.sinking) this.game.recordDialogue(); }
  private step(seconds: number, input: string[] = []) {
    const frames = Math.round(seconds * 120), actual = frames / 120;
    if (this.physicsSeconds + actual > 120 + 1e-6) throw new Error('Exceeded 120-second physics budget; use advance for campaign time');
    this.physicsSeconds += actual;
    const g = this.game; g.keys = new Set(input);
    try { for (let i = 0; i < frames; i++) { g.update(1 / 120); this.present(); } } finally { g.keys.clear(); }
    return { frames, seconds: actual };
  }
  private place(at: string | Vec, angle?: number) {
    const g = this.game;
    const p = typeof at !== 'string' ? at : at === 'pickup' ? g.job.pickup : at === 'dropoff' ? g.job.dropoff : at === 'garage' ? GARAGE : at === 'newsroom' ? g.newsroom : g.missions.catalogue.stops.byId[at]?.position;
    if (!p) throw new Error(`Unknown place: ${at}`);
    const bounds = g.map.document.envelope;
    if (p.x < bounds.min.x || p.x > bounds.max.x || p.y < bounds.min.y || p.y > bounds.max.y) throw new Error('Place is outside the map envelope');
    g.actor.position = { ...p }; g.actor.velocity = vec(); g.actor.angularVelocity = 0;
    if (angle !== undefined) g.actor.angle = angle;
    return { position: { ...p }, fixturePlacement: true };
  }
  private boolean(actual: boolean, expected = true) {
    if (actual !== expected) throw new Error(`Action returned ${actual}; expected ${expected}${this.game.sleepReason ? ` (sleep: ${this.game.sleepReason})` : ''}`);
    return actual;
  }
  private check(c: Extract<ScenarioCommand, { op: 'expect' }>) {
    let actual: unknown = this.snapshot(), exists = true;
    for (const key of c.path.split('.')) {
      if (actual === null || typeof actual !== 'object' || !Object.hasOwn(actual, key)) { actual = undefined; exists = false; break; }
      actual = (actual as Record<string, unknown>)[key];
    }
    // JSON equality without property-order sensitivity.
    const equal = (a: unknown, b: unknown): boolean => {
      if (a === b) return true;
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
      const A = Object.keys(a), B = Object.keys(b);
      return A.length === B.length && A.every(key => Object.hasOwn(b, key) && equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
    };
    const comparator = ['equals', 'includes', 'length', 'exists', 'gte', 'lte'].find(key => Object.hasOwn(c, key))!;
    const expected = (c as unknown as Record<string, unknown>)[comparator];
    const passed = comparator === 'exists' ? exists === expected : !exists ? false : comparator === 'equals' ? equal(actual, expected) :
      comparator === 'includes' ? Array.isArray(actual) ? actual.some(item => equal(item, expected)) : typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected) :
      comparator === 'length' ? (Array.isArray(actual) || typeof actual === 'string') && actual.length === expected :
      typeof actual === 'number' && typeof expected === 'number' && (comparator === 'gte' ? actual >= expected : actual <= expected);
    if (!passed) throw new Error(`${c.path}: expected ${comparator} ${JSON.stringify(expected)}, got ${exists ? JSON.stringify(actual) : '<missing>'}`);
    return { path: c.path, comparator, expected, actual: actual ?? null };
  }
  private apply(c: ScenarioCommand): unknown {
    const g = this.game;
    switch (c.op) {
      case 'facts': {
        const inputs = this.inputs(), f = c.facts;
        for (const flag of Object.keys(f.flags ?? {})) if (!inputs.flags.includes(flag)) throw new Error(`Unknown flag: ${flag}`);
        for (const [group, option] of Object.entries(f.choices ?? {})) {
          if (!Object.hasOwn(inputs.choices, group) || !inputs.choices[group].includes(option)) throw new Error(`Unknown choice: ${group}=${option}`);
          if (g.save.story.choices[group] !== undefined && g.save.story.choices[group] !== option) throw new Error(`Choice ${group} is already committed`);
        }
        for (const [flag, enabled] of Object.entries(f.flags ?? {})) {
          g.save.story.flags = g.save.story.flags.filter(id => id !== flag);
          if (enabled) g.save.story.flags.push(flag);
        }
        Object.assign(g.save.story.choices, f.choices);
        if (f.cash !== undefined) g.save.cash = f.cash;
        if (f.heat !== undefined) g.heat = f.heat;
        if (f.health !== undefined) g.health = f.health;
        g.syncMissionOffers(); g.persist(); return { injected: structuredClone(f) };
      }
      case 'advance': {
        const event = c.event === undefined ? undefined : g.campaignContent.operations.find(op => op.id === c.event);
        if (c.event !== undefined && !event) throw new Error(`Unknown event: ${c.event}`);
        const target = c.to ? calendar(c.to) : event ? event.at : g.save.campaign.minute + c.minutes!;
        number(target, 'campaign minute', CAMPAIGN_START, CAMPAIGN_END);
        if (target < g.save.campaign.minute) throw new Error('Campaign time cannot move backwards');
        const changed = g.advanceNarrativeTo(target); g.syncMissionOffers(); g.persist(); return { target, changed, physicsSkipped: true };
      }
      case 'place': return this.place(c.at, c.angle);
      case 'step': return this.step(c.seconds, c.keys);
      case 'mode': g.setMode(c.mode); return c.mode;
      case 'route': {
        if (!Object.hasOwn(g.missions.catalogue.missions, c.mission)) throw new Error(`Unknown mission: ${c.mission}`);
        return this.boolean(g.routeMissionOffer(c.mission), c.expected);
      }
      case 'pickup': {
        if (g.mode !== 'playing' || g.onFoot || g.job.stage !== 'pickup' || g.navToNewsroom) throw new Error('pickup requires a playing driver with a routed pickup and no newsroom navigation');
        const id = g.job.missionId ?? null; this.place('pickup'); this.step(0.9);
        if (g.job.stage as string !== 'dropoff' || (g.job.missionId ?? null) !== id) throw new Error('Physical pickup did not accept the selected job');
        return { mission: id, fixturePlacement: true };
      }
      case 'deliver': {
        if (g.mode !== 'playing' || g.onFoot || g.job.stage !== 'dropoff' || g.navToNewsroom) throw new Error('deliver requires a playing driver with an aboard ride and no newsroom navigation');
        const id = g.job.missionId ?? null, deliveries = g.save.deliveries; this.place('dropoff'); this.step(0.9);
        if (g.save.deliveries !== deliveries + 1 || id && !g.save.story.completed.includes(id)) throw new Error('Physical delivery did not complete the aboard job');
        return { mission: id, fixturePlacement: true };
      }
      case 'read': if (!g.dialogue.active) throw new Error('No active dialogue'); g.dialogue.readAll(); g.recordDialogue(); return g.dialogue.active.beatId;
      case 'ordinary': if (g.job.stage === 'dropoff') throw new Error('Abandon the aboard ride explicitly first'); g.newJob(false, 'replaced', true); return g.job.name;
      case 'abandon': g.newJob(false, 'shift'); return true;
      case 'photo': return this.boolean(g.observeScene(c.observation), c.expected);
      case 'sleep': return this.boolean(g.sleep(), c.expected);
      case 'submit': if (!Object.hasOwn(this.game.campaignContent.materials, c.material)) throw new Error(`Unknown material: ${c.material}`); return this.boolean(g.submitMaterial(c.material), c.expected);
      case 'publish': return this.boolean(g.requestPublication(c.allegation), c.expected);
      case 'reload': {
        g.persist(); const save = JSON.parse(JSON.stringify(g.save));
        save.story = parseMissionProgress(save.story); save.playerRecords = parsePlayerRecords(save.playerRecords); save.campaign = parseCampaign(save.campaign);
        this.game = new Game(g.map, false, true, save); this.configure(); this.game.start(); this.game.toastTime = 0;
        return { saveRoundTrip: true, transientWorldReset: true };
      }
      case 'expect': return this.check(c);
      case 'capture': if (this.captures.has(c.name)) throw new Error(`Duplicate capture: ${c.name}`); this.captures.add(c.name); return { name: c.name, view: c.view ?? 'world', panelOnly: c.panelOnly ?? false, focus: c.focus ?? 'actor', zoom: c.zoom ?? null };
    }
  }
  /** Each reply contains detached state; failures retain the actual partially executed state. */
  execute(value: unknown) {
    const index = ++this.count;
    let command: ScenarioCommand | undefined;
    try {
      if (index > 500) throw new Error('Exceeded 500-command budget');
      command = parseCommand(value);
      const result = this.apply(command); this.present();
      return { index, command, status: 'passed' as const, result, state: this.snapshot() };
    } catch (error) {
      return { index, command, input: value, status: 'failed' as const, error: (error as Error).message, state: this.snapshot() };
    }
  }
}
