/** Local civil time; bounded budgets shared by traffic and sidewalk residents. */
export function residentialActivity(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  if ((h >= 7 && h < 9) || (h >= 17 && h < 20)) return { traffic: 1, pedestrians: 1 };
  if (h >= 6 && h < 22) return { traffic: .6, pedestrians: .6 };
  return { traffic: .2, pedestrians: .15 };
}
