import type { FareBreakdown } from '../game/fare';

const components = ['comfort', 'speed'] as const;
export const money = (amount: number) => `$${amount.toLocaleString('en-US')}`;
export const signedMoney = (amount: number) => `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${money(Math.abs(amount))}`;

/** Comfort and speed share the receipt's signed money and zero-centred scale. */
export function fareMetersMarkup() {
  return components.map(component => {
    const label = component === 'speed' ? 'Speed' : 'Comfort';
    return `<div class="fare-component receipt-${component}" data-fare-component="${component}">
      <div class="fare-component-heading"><span>${label}</span><strong data-receipt="${component}Bonus"></strong></div>
      <div class="fare-meter" role="meter" aria-label="${label} adjustment" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0">
        <div class="fare-meter-track" aria-hidden="true"><i></i></div><span class="fare-meter-zero" aria-hidden="true">0</span>
      </div>
    </div>`;
  }).join('');
}

export function bindFareMeters(root: HTMLElement) {
  const views = components.map(component => {
    const row = root.querySelector<HTMLElement>(`[data-fare-component="${component}"]`)!;
    return { component, row, amount: row.querySelector<HTMLElement>('strong')!, meter: row.querySelector<HTMLElement>('[role="meter"]')! };
  });
  return (fare: FareBreakdown) => {
    for (const { component, row, amount, meter } of views) {
      const score = fare[`${component}Score`], bonus = fare[`${component}Bonus`];
      const description = bonus === 0 ? 'No adjustment' : `${money(Math.abs(bonus))} ${bonus > 0 ? 'bonus' : 'deduction'}`;
      amount.textContent = signedMoney(bonus);
      row.dataset.sign = bonus > 0 ? 'positive' : bonus < 0 ? 'negative' : 'neutral';
      meter.setAttribute('aria-valuenow', String(score));
      meter.setAttribute('aria-valuetext', description);
      row.title = `${component === 'speed' ? 'Speed' : 'Comfort'}: ${description}`;
      // Both halves share a fixed zero; the fill grows away from it in either direction.
      // Dollar and score rounding can straddle zero: show only actual money changes.
      const position = bonus === 0 ? 0 : score || Math.sign(bonus);
      meter.style.setProperty('--meter-left', `${50 + Math.min(position, 0) / 2}%`);
      meter.style.setProperty('--meter-width', `${Math.abs(position) / 2}%`);
    }
  };
}
