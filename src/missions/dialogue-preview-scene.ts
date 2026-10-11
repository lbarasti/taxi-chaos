import { characters } from '../characters';
import { jobNames } from '../campaign/content';
import { Game } from '../game';
import { defaultCompiledMap } from '../map/compile';
import { generateDialoguePreview, type PreviewState } from './dialogue-preview';

/** Screenshot fixture only: a new, persistence-disabled game for every message. */
export function dialoguePreviewScene(input: PreviewState, missionId: string, view: 'offer' | 'pickup', legacy = false) {
  const game = new Game(defaultCompiledMap, false, legacy ? 'legacy' : true);
  const preview = generateDialoguePreview(game.missions.catalogue, input);
  const job = preview.jobs.find(item => item.id === missionId);
  if (!job) throw new Error(`Job ${missionId} does not match the character/state selection`);
  const mission = game.missions.mission(missionId);
  if (view === 'offer' && !mission.offer) throw new Error(`Job ${missionId} has no offer text`);
  game.releaseMission('reset');
  Object.assign(game.save.story, structuredClone(preview.state));
  game.save.deliveries = preview.context.careerDeliveries ?? preview.context.deliveries;
  game.advanceNarrativeTo(preview.context.minute!);
  game.save.playerRecords.texts = [];
  game.mode = 'playing';
  if (game.player.model !== preview.context.model || game.player.kind !== preview.context.kind) {
    game.player = game.spawnVehicle({ model: preview.context.model, kind: preview.context.kind, position: { ...mission.stops.pickup } });
  }
  if (game.player.definition.access.job !== preview.context.jobType || !game.player.definition.access.playerDrivable) {
    throw new Error('PNG previews need a player-drivable vehicle matching the simulated job type');
  }
  game.player.body.position = { ...mission.stops.pickup };
  game.player.body.velocity = { x: 0, y: 0 };
  game.syncMissionOffers();
  const actualJob = game.missionOffers.get(missionId);
  game.job = { ...(actualJob ?? game.job), missionId, type: preview.context.jobType,
    pickup: { ...mission.stops.pickup }, dropoff: { ...mission.stops.dropoff },
    name: !legacy && jobNames[missionId] ? jobNames[missionId] : mission.passenger ? characters[mission.passenger].name : 'Customer',
    destination: job.route.dropoff, stage: view === 'pickup' ? 'dropoff' : 'pickup', wait: 0, elapsed: 0 };
  // Show just this offer through the real inbox renderer. For locked copy this is
  // an archived fixture receipt; the real director still disables its route button.
  game.save.playerRecords.texts = mission.offer && view === 'offer' ? [{
    messageId: mission.offer.messageId, missionId, character: mission.offer.character,
    sender: characters[mission.offer.character].name, title: mission.title, text: mission.offer.text,
    pickup: job.route.pickup, receivedAt: preview.context.time, readAt: null,
  }] : [];
  if (view === 'pickup') {
    const beat = preview.context.jobType === 'parcel' && mission.beats.pickupSender ? mission.beats.pickupSender : mission.beats.pickup;
    game.dialogue.start(beat.beatId, beat.message);
    game.dialogue.readAll();
  } else game.dialogue.clear();
  game.toastTime = 0;
  return { game, preview, job };
}
