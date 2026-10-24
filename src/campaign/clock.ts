import { formatClock } from '../world/day-night';

export const dayMinute = (day: number, hour = 7, minute = 0) => (day - 1) * 1440 + hour * 60 + minute;
export const CAMPAIGN_START = dayMinute(1);
export type CampaignTiming = Readonly<{ start: number; end: number; lastEdition: number; editionHour: number }>;
export const campaignDays = (timing: CampaignTiming) => Math.ceil((timing.end - timing.start) / 1440);
/** A working day starts at 07:00; the following overnight period belongs to it. */
export const workingDay = (minute: number, timing: CampaignTiming) => Math.max(1, Math.floor((minute - timing.start + 1e-6) / 1440) + 1);
export const campaignDay = (minute: number, timing: CampaignTiming) => Math.min(campaignDays(timing), workingDay(minute, timing));
/** Calendar dates label the HUD, records and editions, independently of overnight shifts. */
export const displayDay = (minute: number, timing: CampaignTiming) => Math.max(1, Math.min(campaignDays(timing), Math.floor(minute / 1440) - Math.floor(timing.start / 1440) + 1));
export const nextMorning = (minute: number, timing: CampaignTiming) => timing.start + (Math.floor((minute - timing.start + 1e-6) / 1440) + 1) * 1440;
export const nextEdition = (minute: number, timing: CampaignTiming) => (Math.floor((minute - timing.editionHour * 60) / 1440) + 1) * 1440 + timing.editionHour * 60;
export const editionTime = (day: number, timing: CampaignTiming) => Math.max(timing.start, (Math.floor(timing.start / 1440) + day - 1) * 1440 + timing.editionHour * 60);
export const calendarLabel = (minute: number) => `Day ${Math.floor(minute / 1440) + 1} · ${formatClock(minute)}`;
