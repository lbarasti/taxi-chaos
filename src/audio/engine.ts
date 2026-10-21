import { clamp } from '../physics/physics';

export type EngineSignal = { gear: number; gears: number; rpm: number; shifting: boolean; rate: number; gain: number };
type EngineInput = { vehicle: number; time: number; speed: number; throttle: number; boosting: boolean; gearSpeeds: readonly number[] };

/** Presentation only: ratios never change vehicle forces, saves or simulation RNG.
 * gearSpeeds are forward m/s at the shift point; reverse has its own fixed ratio. */
export class EngineSound {
  private vehicle = -1;
  private time = -Infinity;
  private gear = 1;
  private shiftUntil = -Infinity;
  private nextShift = -Infinity;

  reset() { this.vehicle = -1; this.time = -Infinity; this.shiftUntil = this.nextShift = -Infinity; }

  update(input: EngineInput): EngineSignal {
    const { vehicle, time, speed, throttle, boosting, gearSpeeds } = input;
    const reverse = speed < -0.5 || (speed < 0.5 && throttle < 0);
    const roadSpeed = Math.abs(speed), gears = gearSpeeds.length;
    // Rejoin the current road speed after switching cars, fixed stepping or reset.
    // Ordinary pause/resume keeps the selected gear because game time is frozen.
    if (vehicle !== this.vehicle || time < this.time || time - this.time > 0.5) {
      const initial = gearSpeeds.findIndex(limit => roadSpeed < limit);
      this.gear = reverse ? -1 : initial < 0 ? gears : initial + 1;
      this.shiftUntil = this.nextShift = -Infinity;
    }
    this.vehicle = vehicle; this.time = time;
    this.gear = Math.min(this.gear, gears);
    if (reverse || roadSpeed < 0.7 || this.gear < 0) {
      this.gear = reverse ? -1 : 1;
      this.shiftUntil = this.nextShift = -Infinity;
    } else if (time >= this.nextShift) {
      const previous = this.gear;
      if (this.gear < gears && speed >= gearSpeeds[this.gear - 1]) this.gear++;
      // Hysteresis and a dwell prevent repeated shifts around a speed boundary.
      else if (this.gear > 1 && speed < gearSpeeds[this.gear - 2] * 0.7) this.gear--;
      if (this.gear !== previous) {
        this.shiftUntil = time + (this.gear > previous ? 0.17 : 0.12);
        this.nextShift = time + 0.3;
      }
    }
    const shifting = time < this.shiftUntil;
    // Brake input while travelling forward is not engine load. Reverse uses it.
    const load = clamp(this.gear < 0 ? -throttle : throttle, 0, 1);
    const rpm = clamp(Math.max(roadSpeed / gearSpeeds[Math.max(0, this.gear - 1)], load * 0.18) + (boosting && !shifting ? 0.04 : 0), 0, 1);
    return { gear: this.gear, gears, rpm, shifting,
      rate: 0.7 + rpm * 1.25,
      // Leave headroom for tyres, impacts, boost and nearby world effects.
      gain: (0.055 + rpm * 0.035 + load * 0.035) * (shifting ? 0.28 : 1),
    };
  }
}
