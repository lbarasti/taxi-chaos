import type { Game } from '../game/game';
import { campaignDays, calendarLabel } from './clock';
import { editionArticle } from './editions';
import { escape } from './view';
import { menuItem, type DrawerPage } from '../ui/drawer-markup';

export function publicationsMarkup(game: Game, selectedDay?: number, back: DrawerPage = 'newsroom', selectedArticle?: string): string {
  const editions = [...game.save.campaign.editions].reverse();
  const edition = editions.find(edition => edition.day === selectedDay) ?? editions[0];
  const press = game.campaignContent.newspaper;
  const reading = edition?.articles.includes(selectedArticle ?? '') ? editionArticle(game.campaignContent, selectedArticle!) : undefined;
  const heading = `<div class="intro-eyebrow">NEWSROOM / PUBLICATIONS</div><nav class="publication-controls" aria-label="Publication actions">${reading ? menuItem('Back to front page', { id: 'publication-front' }) : ''}${menuItem(back === 'finale' ? 'Back to campaign recap' : 'Back to newsroom', { id: 'publication-back', page: back })}${menuItem(back === 'finale' ? 'Continue in arcade mode' : 'Back to the streets', { id: back === 'finale' ? 'arcade-continue' : 'start' })}</nav>`;
  if (!press || !edition) return `${heading}<h2 id="modal-title">Publications.</h2><p>No editions have been printed yet.</p>`;
  const [lead, ...others] = edition.articles.map(id => editionArticle(game.campaignContent, id)).filter(article => !!article);
  if (!lead) return `${heading}<h2 id="modal-title">Publications.</h2><p>This edition is unavailable.</p>`;
  const article = reading ?? lead;
  const briefs = edition.briefs.map(id => press.briefs.find(brief => brief.id === id)).filter(brief => !!brief);
  const reports = game.save.campaign.publications.filter(publication => publication.at === edition.at).length;
  return `${heading}<div class="publication-layout"><div class="publication-current">
    <article class="newspaper" data-edition-day="${edition.day}">
      <div class="newspaper-overline"><span>Independent local reporting</span><span>Waterfront · City · People</span></div>
      <h2 id="modal-title" class="newspaper-masthead">${escape(press.masthead)}</h2>
      <div class="newspaper-dateline"><span>Day ${edition.day} · ${edition.at === game.campaignContent.timing.lastEdition ? 'Final campaign edition' : 'Morning edition'}</span><time>${escape(calendarLabel(edition.at).split(' · ')[1])}</time></div>
      <p class="newspaper-section">${escape(article.section)}</p><h3 class="newspaper-headline">${escape(article.title)}</h3><p class="newspaper-deck">${escape(article.deck)}</p>
      <div class="newspaper-lead${article.image ? '' : ' newspaper-text-only'}" data-article="${escape(article.id)}">
        ${article.image ? `<figure><img src="${escape(article.image)}" alt="${escape(article.imageAlt)}" width="1000" height="667"><figcaption>${escape(article.caption)}</figcaption></figure>` : ''}
        <div class="newspaper-copy"><p class="newspaper-byline">${escape(press.byline)}</p>${article.body.map(paragraph => `<p>${escape(paragraph)}</p>`).join('')}</div>
      </div>
      ${!reading && (others.length || briefs.length) ? `<div class="newspaper-briefs">${others.map(article => `<section><h4>${escape(article.title)}</h4><p>${escape(article.deck)}</p><button class="menu-item newspaper-read" id="read-article-${escape(article.id)}" data-read-article="${escape(article.id)}" aria-label="Read ${escape(article.title)}"><span>Read article</span></button></section>`).join('')}${briefs.map(brief => `<section><h4>${escape(brief.title)}</h4><p>${escape(brief.text)}</p></section>`).join('')}</div>` : ''}
    </article>
    <p class="publication-contribution">${reports ? `Your sources helped bring ${reports === 1 ? 'a checked story' : `${reports} checked stories`} to print in this edition.` : 'Local coverage · the city keeps moving between your fares.'} This edition is kept as printed.</p>
    </div><nav class="edition-archive" aria-label="Edition archive"><h3>Edition archive</h3>${editions.map(issue => `<button class="menu-item" id="edition-${issue.day}" data-edition="${issue.day}" aria-pressed="${issue.day === edition.day}"><span>Day ${issue.day}<small>${issue.read ? 'Read' : 'Unread'} · ${escape(editionArticle(game.campaignContent, issue.articles[0])?.title ?? 'Morning edition')}</small></span></button>`).join('')}</nav></div>`;
}

export function finaleMarkup(game: Game): string {
  if (!game.save.campaign.finished) return `<h2 id="modal-title">The story continues.</h2>${menuItem('Back', { id: 'finale-back', page: 'home' })}`;
  const milestones = game.campaignContent.milestones ?? [];
  return `<section class="campaign-finale"><div class="intro-eyebrow">${escape(game.campaignContent.title.toUpperCase())} / ${campaignDays(game.campaignContent.timing)}-DAY STORY</div>
    <h2 id="modal-title">Campaign complete.<br><em>The city carries on.</em></h2><p class="finale-intro">${escape(game.campaignContent.completionText)} Your journeys left these stories behind.</p>
    <nav class="game-menu" aria-label="Campaign completion actions">${menuItem('Continue in arcade mode', { id: 'arcade-continue' })}${game.save.campaign.editions.length ? menuItem('Read the final edition', { id: 'final-edition', page: 'publications' }) : ''}${game.save.campaign.endingSeen ? menuItem('Back to pause menu', { id: 'finale-back', page: 'home' }) : ''}</nav>
    <div class="finale-outcomes">${milestones.map(milestone => { const achieved = game.campaignMatches(milestone.requires); return `<article data-achieved="${achieved}"><span aria-hidden="true">${achieved ? '✓' : '—'}</span><div><h3>${escape(achieved ? milestone.title : milestone.missedTitle)}</h3><p>${escape(achieved ? milestone.text : milestone.missedText)}</p></div></article>`; }).join('')}</div>
    <div class="finale-career"><span>Cash <strong>$${Math.floor(game.save.cash).toLocaleString('en-US')}</strong></span><span>Career deliveries <strong>${game.save.deliveries}</strong></span></div>

    <p class="finale-continuation">Your cash, garage and upgrades carry on with you. Dispatcher calls, fares and vehicle progression continue in arcade mode. The campaign story is complete.</p><p class="menu-hint" id="menu-hint"></p></section>`;
}
