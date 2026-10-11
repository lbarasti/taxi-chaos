import { formatClock } from '../day-night';

export const dayMinute = (day: number, hour = 7, minute = 0) => (day - 1) * 1440 + hour * 60 + minute;
export const CAMPAIGN_START = dayMinute(1);
export const CAMPAIGN_END = dayMinute(15);
export const LAST_EDITION = dayMinute(14, 6);
/** A working day starts at 07:00; the following overnight period belongs to it. */
export const campaignDay = (minute: number) => Math.max(1, Math.min(14, Math.floor((minute - CAMPAIGN_START + 1e-6) / 1440) + 1));
export const nextMorning = (minute: number) => Math.min(CAMPAIGN_END, CAMPAIGN_START + (Math.floor((minute - CAMPAIGN_START + 1e-6) / 1440) + 1) * 1440);
export const nextEdition = (minute: number) => (Math.floor((minute - 360) / 1440) + 1) * 1440 + 360;
export const calendarLabel = (minute: number) => `Day ${Math.floor(minute / 1440) + 1} · ${formatClock(minute)}`;
