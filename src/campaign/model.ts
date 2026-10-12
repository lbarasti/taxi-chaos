import type { CharacterId } from '../characters';
import type { Condition, Effect, MissionCatalogue } from '../missions/schema';
import type { MissionEvent } from '../missions/director';
import type { MissionProgress } from '../missions/progress';
import type { NotebookEntry, PlayerRecords } from '../player-records';
import type { VehicleModel } from '../vehicles';
import type { Campaign } from './state';

export type WorldValue = string | number | boolean;
export type WorldState = Record<string, WorldValue>;
export type Allegation = string;
export type Material = Readonly<Pick<NotebookEntry, 'title' | 'text' | 'kind' | 'source'>>;
export type Outcome = Readonly<{ id: string; requires?: Condition; effects: readonly Effect[] }>;
export type WorldOperation = Readonly<{ id: string; at: number; effects: readonly Effect[]; outcomes?: readonly Outcome[] }>;
export type Claim = Readonly<{
  title: string; routes: readonly (readonly string[])[];
  verifyRequires?: Condition; approveRequires?: Condition; publishRequires?: Condition;
  reactionEffects: readonly Effect[];
}>;
export type CampaignInputs = { progress?: MissionProgress; records?: PlayerRecords };
export type CampaignContext = CampaignInputs & { state: Campaign; definition: CampaignDefinition };
export type CampaignEvent =
  | MissionEvent
  | { type: 'clock'; at: number }
  | { type: 'observation'; id: string }
  | { type: 'material-submitted'; id: string }
  | { type: 'publication-requested'; id: string }
  | { type: 'operation'; id: string; outcome: string; effects: readonly Effect[] }
  | { type: 'material-verified'; id: string; at: number }
  | { type: 'case-verified'; id: string; at: number }
  | { type: 'edition'; id: string; at: number }
  | { type: 'reaction'; id: string; at: number }
  | { type: 'ride-completed'; missionId?: string; name: string; receipt: Omit<NotebookEntry, 'at' | 'shift'> };
export type EventHandler = Readonly<{
  on: CampaignEvent['type']; id?: string; requires?: Condition; effects: readonly Effect[];
}>;
export type ConditionalText = Readonly<{ requires?: Condition; text: string }>;
export type ScenePrimitive =
  | Readonly<{ rect: readonly [number, number, number, number, string] }>
  | Readonly<{ label: readonly [string, number, number, number, string, string?] }>;
export type SceneLayer = Readonly<{
  site?: string; vehicle?: string; rotate?: boolean; requires?: Condition; shapes: readonly ScenePrimitive[];
}>;
export type CampaignDefinition = Readonly<{
  id: string; title: string; finishedLabel: string; completionText: string;
  initialWorld: Readonly<WorldState>; operations: readonly WorldOperation[];
  materials: Readonly<Record<string, Material>>; claims: Readonly<Record<string, Claim>>;
  missions: MissionCatalogue; jobWindows: Readonly<Record<string, Readonly<{ from: number; until: number }>>>;
  jobNames: Readonly<Record<string, string>>; handlers: readonly EventHandler[];
  newsroom: Readonly<{ stop: string; name: string; editor: string; guide: string }>;
  sites: Readonly<Record<string, string>>;
  observations: readonly Readonly<{ id: string; stop: string; radius: number; requires: Condition; label: string; unavailable: string; success: string }>[];
  vehicles: readonly Readonly<{ id: string; model: VehicleModel; stop: string; offsets: readonly Readonly<{ x: number; y: number }>[]; angle: number; color: string; present: Condition; departTo: string }>[];
  scenes: readonly SceneLayer[]; bulletins: readonly ConditionalText[];
  rides: Readonly<Record<string, Readonly<{ during: string; arrival: string; channel?: 'passenger' | 'sender' }>>>;
  everydayJobs: readonly Readonly<{ name: string; family: string; lines: readonly string[]; during: string }>[];
  ordinaryResponses: readonly ConditionalText[]; dispatcher: CharacterId;
}>;
