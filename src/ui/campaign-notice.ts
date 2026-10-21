import type { Game } from '../game/game';
import { editionArticle } from '../campaign/editions';

export const campaignNoticeMarkup = `<button id="campaign-notice" class="campaign-notice" aria-haspopup="dialog" aria-controls="modal" hidden><small></small><strong></strong><span></span></button>`;
export function bindCampaignNotice(root: HTMLElement, currentGame: () => Game, actions: { editions: () => void; finale: () => void }) {
  const button = root.querySelector<HTMLButtonElement>('#campaign-notice')!;
  button.addEventListener('click', () => {
    const game = currentGame();
    if (game.mode !== 'playing') return;
    if (game.save.campaign.finished && !game.save.campaign.endingSeen) actions.finale();
    else actions.editions();
  });
  return () => {
    const game = currentGame(), campaign = game.save.campaign;
    const unread = campaign.editions.filter(edition => !edition.read), latest = unread.at(-1);
    const finale = campaign.finished && !campaign.endingSeen;
    button.hidden = !game.campaignEnabled || game.mode !== 'playing' || (!latest && !finale);
    if (button.hidden) return;
    button.querySelector('small')!.textContent = finale ? 'Campaign complete' : `Day ${latest!.day} · ${unread.length} unread ${unread.length === 1 ? 'edition' : 'editions'}`;
    button.querySelector('strong')!.textContent = finale ? game.campaignContent.title : editionArticle(game.campaignContent, latest!.articles[0])?.title ?? 'Morning edition';
    button.setAttribute('aria-label', `${button.querySelector('small')!.textContent}: ${button.querySelector('strong')!.textContent}. ${finale ? 'Review campaign recap' : 'Read the paper'}`);
    button.querySelector('span')!.textContent = finale ? 'Review your story · Continue in arcade mode' : 'Read the paper →';
  };
}
