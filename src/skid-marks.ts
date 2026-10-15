/** Visual rubber deposits are deliberately stricter than physics skidding.
 * A tyre can have a small slip angle while still gripping the road.
 * Speeds are measured at the contact point relative to the tyre's heading.
 */
export type RubberMarkState = { duration: number; marking: boolean };
export const freshRubberMark = (): RubberMarkState => ({ duration: 0, marking: false });

export function updateRubberMark(state: RubberMarkState, lateralSpeed: number, rollingSpeed: number, dt: number): boolean {
  const lateral = Math.abs(lateralSpeed), forward = Math.abs(rollingSpeed);
  // Absolute sideways movement AND a substantial slip angle are necessary.
  // Hysteresis holds an established mark through minor changes in slip.
  const sliding = forward > 4 &&
    lateral > (state.marking ? 2.3 : 3.5) &&
    lateral / Math.max(forward, 1) > (state.marking ? 0.14 : 0.22);
  if (!sliding) { state.duration = 0; state.marking = false; return false; }
  state.duration += dt;
  if (state.duration >= 0.12) state.marking = true;
  return state.marking;
}
