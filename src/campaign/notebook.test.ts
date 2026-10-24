import { describe, expect, it } from 'vitest';
import { Game } from '../game/game';
import { parsePlayerRecords, type NotebookEntry, type NotebookRun } from '../narrative/player-records';
import { parseCampaign } from './state';
import { notebookGroups } from './notebook';
import { notebookMarkup } from './view';

const run: NotebookRun = { id: 'run-cleo-1', customer: 'Cleo', character: 'cleo', type: 'parcel', destination: 'East Village', minute: 420 };
const entry = (id: string, kind: NotebookEntry['kind'], text: string, details: Partial<NotebookEntry> = {}): NotebookEntry =>
  ({ id, title: 'Cleo · ride conversation', kind, text, shift: 1, minute: 420, at: 0, ...details });
const groups = (game: Game) => notebookGroups(game.save.playerRecords.notebook, game.campaignContent, game.missions.catalogue.stops);
const make = () => {
  const game = new Game(undefined, false);
  game.vehicles = [game.player]; game.trafficTarget = 0; game.settings.noPolice = true; game.start();
  return game;
};
const arrive = (game: Game, point: { x: number; y: number }) => {
  game.player.body.position = { ...point }; game.player.body.velocity = { x: 0, y: 0 };
  for (let tick = 0; tick < 108; tick++) game.update(1 / 120);
};

describe('notebook runs', () => {
  it('keeps repeated customers in distinct runs, ordered newest first with chronological conversations and one total', () => {
    const game = make(), later = { ...run, id: 'run-cleo-2', minute: 480, type: 'fare' as const };
    game.save.playerRecords.notebook = [
      entry('pickup', 'conversation', 'Please deliver the gloves.', { run }),
      entry('fare-1', 'receipt', 'Hidden accounting details', { run: { ...run, totalFare: 20 } }),
      entry('arrival', 'conversation', 'Everything is here.', { run }),
      entry('pickup-later', 'conversation', 'Another trip.', { run: later }),
      entry('fare-2', 'receipt', 'More accounting', { run: { ...later, totalFare: 0 } }),
    ];
    const before = structuredClone(game.save);
    expect(groups(game).map(group => group.id)).toEqual([later.id, run.id]);
    expect(groups(game)[1].entries.map(entry => entry.id)).toEqual(['pickup', 'fare-1', 'arrival']);
    const html = notebookMarkup(game);
    expect(html.match(/>Cleo<svg/g)).toHaveLength(2);
    expect(html.match(/DAY 1 · 07:00/g)).toHaveLength(1);
    expect(html.match(/To East Village/g)).toHaveLength(2);
    expect(html).toContain('Total fare <strong>$0</strong>');
    expect(html).toContain('Total fare <strong>$20</strong>');
    expect(html).toContain('aria-label="Parcel delivery"'); expect(html).toContain('aria-label="Passenger fare"');
    expect(html).toContain('data:image/webp;base64,');
    expect(html.indexOf('Please deliver the gloves.')).toBeLessThan(html.indexOf('Everything is here.'));
    expect(html).not.toMatch(/notebook-search|Find a record|Hidden accounting|More accounting|ride conversation/);
    expect(game.save).toEqual(before);
  });

  it('groups saved ordinary receipts and conversations without showing dispatch calls or financial breakdowns', () => {
    const game = make();
    game.save.playerRecords.notebook = [
      entry('ordinary-1-dispatch', 'conversation', 'New delivery · Cleo. Small deliveries. Pickup marked; destination East Village.', { source: 'bea' }),
      entry('ordinary-1-pickup', 'conversation', 'Gloves and cleaning supplies.', { source: 'cleo' }),
      entry('fare-1', 'receipt', 'Cleo. Pickup (76, 164) → East Village. Base $14 · Speed +$3 · Comfort +$3 · Paid $20. Gloves and cleaning supplies.', { title: 'Cleo · signed delivery receipt' }),
      entry('ride-ordinary-1-arrival', 'conversation', 'Everything is here. Thank you.', { source: 'cleo' }),
    ];
    const grouped = groups(game);
    expect(grouped).toHaveLength(1); expect(grouped[0].entries).toHaveLength(3);
    expect(grouped[0].run).toMatchObject({ customer: 'Cleo', character: 'cleo', type: 'parcel', destination: 'East Village', totalFare: 20 });
    const html = notebookMarkup(game);
    expect(html.replace(/<[^>]*>/g, ' ')).not.toMatch(/New delivery|Pickup marked|76|164|Base|Speed|Comfort|\$14|\$3/);
    expect(html.match(/Gloves and cleaning supplies\./g)).toHaveLength(1);
  });

  it('groups older authored material with its booking and keeps observations separate', () => {
    const game = make(), material = game.campaignContent.materials['barrier-receipt'];
    game.save.playerRecords.notebook = [
      entry('ride-celia-barriers-pickup', 'conversation', 'The barriers are temporary.', { source: 'celia', at: 10 }),
      entry('barrier-receipt', material.kind, material.text, { ...material, at: 20 }),
      entry('fare-2', 'receipt', 'Celia Ward. Pickup (44, 14) → Garden Café. Base $10 · Speed +$2 · Comfort +$2 · Paid $14. Temporary barriers', { title: 'Celia Ward · signed fare receipt', at: 20 }),
      entry('ride-celia-barriers-arrival', 'conversation', 'Keep both sheets.', { source: 'celia', at: 21 }),
      entry('cafe-photo', 'observation', 'Boarded windows.', { title: 'Garden Café frontage', at: 30 }),
    ];
    expect(groups(game).map(group => group.entries.map(entry => entry.id))).toEqual([
      ['cafe-photo'], ['ride-celia-barriers-pickup', 'barrier-receipt', 'fare-2', 'ride-celia-barriers-arrival'],
    ]);
    expect(notebookMarkup(game)).toContain('id="submit-barrier-receipt"');
    expect(notebookMarkup(game)).toContain('data-record="cafe-photo"');
  });

  it('retains one run across a mid-ride save and arrival after dispatch advances to the next job', () => {
    const source = make(); arrive(source, source.job.pickup); source.dialogue.readAll(); source.recordDialogue();
    const original = source.job.notebookRun!;
    const save = source.saveSnapshot(); save.campaign = parseCampaign(save.campaign); save.playerRecords = parsePlayerRecords(save.playerRecords);
    const game = new Game(undefined, false, true, save);
    game.vehicles = [game.player]; game.trafficTarget = 0; game.settings.noPolice = true; game.start();
    expect(game.job.notebookRun).toEqual(original);
    arrive(game, game.job.dropoff); game.dialogue.readAll(); game.recordDialogue();
    expect(game.job.stage).toBe('pickup');
    expect(groups(game)).toHaveLength(1);
    expect(groups(game)[0].entries.map(entry => entry.id)).toEqual(['ride-bea-first-shift-pickup', 'fare-1', 'ride-bea-first-shift-arrival']);
    expect(groups(game)[0].run?.totalFare).toBeGreaterThanOrEqual(0);
    expect(groups(game)[0].run?.id).toBe(original.id);
  });

  it('records ride material in its run and never records generated dispatch announcements', () => {
    const game = make(); game.newJob(false, 'replaced', true); game.answerDispatch(); game.dialogue.readAll(); game.recordDialogue();
    expect(game.save.playerRecords.notebook).toEqual([]);
    expect(game.routeMissionOffer('celia-barriers')).toBe(true);
    arrive(game, game.job.pickup); game.dialogue.readAll(); game.recordDialogue();
    const id = game.job.notebookRun!.id;
    arrive(game, game.job.dropoff); game.dialogue.readAll(); game.recordDialogue();
    const material = game.save.playerRecords.notebook.find(entry => entry.id === 'barrier-receipt');
    expect(material?.run?.id).toBe(id);
    expect(groups(game)).toHaveLength(1);
    expect(groups(game)[0].entries).toContain(material);
  });
});
