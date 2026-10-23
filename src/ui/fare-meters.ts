import type { FareBreakdown } from '../game/fare';

const components = ['comfort', 'speed'] as const;
export const money = (amount: number) => `$${amount.toLocaleString('en-US')}`;
export const signedMoney = (amount: number) => `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${money(Math.abs(amount))}`;

/** Comfort and speed share the receipt's signed money and zero-centred scale. */
export function fareMetersMarkup() {
  return components.map(component => {
    const label = component === 'speed' ? 'Speed' : 'Comfort';
    const icon = component === 'speed'
      ? '<circle cx="12" cy="12" r="10"/><path d="M5 16a8 8 0 1 1 14 0 M12 5v2 M5 10l2 1 M19 10l-2 1 M12 13l4-5"/><circle cx="12" cy="13" r="1"/>'
      : '<circle cx="12" cy="12" r="10"/><path d="m8 9 2 8h7 M8 6v.5 M7 9h3l2 6h5"/>';
    return `<div class="fare-component receipt-${component}" data-fare-component="${component}">
      <svg class="receipt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>
      <div class="fare-meter" role="meter" aria-label="${label} adjustment" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0">
        <div class="fare-meter-track" aria-hidden="true"><i></i></div><span class="fare-meter-zero" aria-hidden="true">0</span>
      </div>
      <strong data-receipt="${component}Bonus"></strong>
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
