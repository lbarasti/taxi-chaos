import type { CharacterId } from '../narrative/characters';
import type { Condition, Effect, MissionCatalogue } from '../missions/schema';
import type { MissionEvent } from '../missions/director';
import type { MissionProgress } from '../missions/progress';
import type { NotebookEntry, NotebookRun, PlayerRecords } from '../narrative/player-records';
import type { VehicleModel } from '../vehicles/vehicles';
import type { Campaign } from './state';
import type { CampaignTiming } from './clock';

export type WorldValue = string | number | boolean;
export type WorldState = Record<string, WorldValue>;
export type Allegation = string;
export type Material = Readonly<Pick<NotebookEntry, 'title' | 'text' | 'kind' | 'source'>>;
export type Outcome = Readonly<{ id: string; requires?: Condition; effects: readonly Effect[] }>;
export type WorldOperation = Readonly<{ id: string; at: number; effects: readonly Effect[]; outcomes?: readonly Outcome[] }>;
export type Claim = Readonly<{
  title: string; routes: readonly (readonly string[])[];
  verifyRequires?: Condition; publishRequires?: Condition;
  reactionEffects: readonly Effect[];
}>;
export type CampaignInputs = { progress?: MissionProgress; records?: PlayerRecords; ride?: Readonly<{ comfort: number }> };
export type CampaignContext = CampaignInputs & { state: Campaign; definition: CampaignDefinition; notebookRun?: NotebookRun };
export type CampaignEvent =
  | MissionEvent
  | { type: 'clock'; at: number }
  | { type: 'observation'; id: string }
  | { type: 'material-submitted'; id: string }
  | { type: 'operation'; id: string; outcome: string; effects: readonly Effect[] }
  | { type: 'material-verified'; id: string; at: number }
  | { type: 'case-verified'; id: string; at: number }
  | { type: 'edition'; id: string; at: number }
  | { type: 'reaction'; id: string; at: number }
  | { type: 'stopover-completed'; missionId: string }
  | { type: 'ride-completed'; missionId?: string; name: string; comfort?: number; receipt: Omit<NotebookEntry, 'at' | 'shift'> };
export type EventHandler = Readonly<{
  on: CampaignEvent['type']; id?: string; requires?: Condition; effects: readonly Effect[];
}>;
export type ConditionalText = Readonly<{ requires?: Condition; text: string }>;
export type Stopover = Readonly<{
  stop: string; title: string; request: string; seconds: number; completedText: string; effects: readonly Effect[];
  /** The HUD uses these only for this stop; its own vocabulary stays generic. */
  labels?: Readonly<{ route?: string; begin?: string; active?: string; paused?: string }>;
}>;
/** A contextual stop usable by generated fares without a campaign mission. */
export type ProceduralStopover = Stopover & Readonly<{ id: string }>;
export type NewsArticle = Readonly<{
  id: string; title: string; deck: string; body: readonly string[];
  image?: string; imageAlt: string; caption: string; section: string;
}>;
/** Only clock and scheduled ledger facts have an unambiguous state at printing. */
export type EditionCondition =
  | Readonly<{ all: readonly EditionCondition[] }>
  | Readonly<{ any: readonly EditionCondition[] }>
  | Readonly<{ not: EditionCondition }>
  | Extract<Condition, { minuteAtLeast: number } | { minuteBefore: number } | { shiftAtLeast: number } | { shiftAtMost: number }
    | { worldEquals: unknown } | { worldAtLeast: unknown } | { occurred: string } | { published: string } | { reacted: string }>;
export type Newspaper = Readonly<{
  masthead: string; byline: string; daily: readonly NewsArticle[];
  investigations: Readonly<Record<string, NewsArticle>>;
  briefs: readonly Readonly<{ id: string; requires?: EditionCondition; title: string; text: string }>[];
}>;
export type CampaignMilestone = Readonly<{
  requires: Condition; title: string; text: string; missedTitle: string; missedText: string;
}>;
export type ScenePrimitive =
  | Readonly<{ rect: readonly [number, number, number, number, string] }>
  | Readonly<{ label: readonly [string, number, number, number, string, string?] }>;
export type SceneLayer = Readonly<{
  site?: string; vehicle?: string; rotate?: boolean; requires?: Condition; shapes: readonly ScenePrimitive[];
}>;
/** One coherent ordinary booking; its dialogue travels with its actual route. */
export type EverydayJourney = Readonly<{
  id: string; pickup: string; dropoff: string;
  line: string; during: string; arrival: string; roughArrival?: string;
  requires?: Condition; stopover?: Stopover;
}>;
export type EverydayJob = Readonly<{
  character: CharacterId; name: string; family: string;
  /** Presentation fallback for independently authored campaign definitions. */
  lines: readonly string[]; during: string;
  journeys?: readonly EverydayJourney[]; parcelJourneys?: readonly EverydayJourney[];
}>;
export type CampaignDefinition = Readonly<{
  id: string; title: string; finishedLabel: string; completionText: string;
  timing: CampaignTiming; newspaper?: Newspaper; milestones?: readonly CampaignMilestone[];
  initialWorld: Readonly<WorldState>; operations: readonly WorldOperation[];
  materials: Readonly<Record<string, Material>>; claims: Readonly<Record<string, Claim>>;
  missions: MissionCatalogue; jobWindows: Readonly<Record<string, Readonly<{ from: number; until: number }>>>;
  jobNames: Readonly<Record<string, string>>; handlers: readonly EventHandler[];
  newsroom: Readonly<{ stop: string; name: string }>;
  sites: Readonly<Record<string, string>>;
  observations: readonly Readonly<{ id: string; stop: string; radius: number; requires: Condition; label: string; unavailable: string; success: string }>[];
  vehicles: readonly Readonly<{ id: string; model: VehicleModel; stop: string; offsets: readonly Readonly<{ x: number; y: number }>[]; angle: number; color: string; present: Condition; departTo: string }>[];
  scenes: readonly SceneLayer[]; bulletins: readonly ConditionalText[];
  rides: Readonly<Record<string, Readonly<{ during: string; arrival: string; channel?: 'passenger' | 'sender' }>>>;
  everydayJobs: readonly EverydayJob[];
  ordinaryResponses: readonly ConditionalText[]; dispatcher: CharacterId;
  /** Optional local errands use the same physical ride and remain explicitly voluntary. */
  stopovers?: Readonly<Record<string, Stopover>>;
  proceduralStopovers?: readonly ProceduralStopover[];
  rideVariants?: Readonly<Record<string, Readonly<{ during?: readonly ConditionalText[]; arrival?: readonly ConditionalText[] }>>>;
}>;
