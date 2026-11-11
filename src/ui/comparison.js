import { CATALOG } from '../catalog.js';
import { calculateQuote, formatMoney } from '../quote.js';
import { byId, element } from './dom.js';

// Cambia solo el servicio: los tres escenarios comparten extras y condiciones.
export function getComparisonOptions(quote) {
  const current = calculateQuote(quote);
  return CATALOG.services.map((service) => {
    const alternative = calculateQuote({ ...current.quote, serviceId: service.id });
    return {
      serviceId: service.id,
      name: service.name,
      totalCents: alternative.totalCents,
      estimatedDays: alternative.estimatedDays,
      differenceCents: alternative.totalCents - current.totalCents,
      isCurrent: service.id === current.quote.serviceId,
    };
  });
}

function differenceLabel(option) {
  if (option.isCurrent) return 'Tu opción actual';
  if (option.differenceCents === 0) return 'Mismo importe que tu opción actual';
  const amount = formatMoney(Math.abs(option.differenceCents));
  return option.differenceCents > 0
    ? `${amount} más que tu opción actual` : `${amount} menos que tu opción actual`;
}

export function renderComparison(quote, onSelect) {
  const container = byId('comparison-options');
  if (!container) return;
  container.replaceChildren(...getComparisonOptions(quote).map((option) => {
    const card = element('article', undefined,
      `comparison-card${option.isCurrent ? ' is-current' : ''}`);
    card.id = `comparison-${option.serviceId}`;
    card.tabIndex = -1;
    card.setAttribute('aria-labelledby', `${card.id}-title`);
    const title = element('h3', option.name);
    title.id = `${card.id}-title`;
    const button = element('button',
      option.isCurrent ? 'Seleccionado' : 'Usar esta opción', 'button button-ghost');
    button.type = 'button';
    button.disabled = option.isCurrent;
    button.setAttribute('aria-label', option.isCurrent
      ? `${option.name}, opción seleccionada` : `Usar ${option.name}`);
    button.addEventListener('click', () => onSelect(option.serviceId));
    card.append(
      element('span', option.isCurrent ? 'En tu propuesta' : 'Otra posibilidad', 'comparison-label'),
      title,
      element('p', formatMoney(option.totalCents), 'comparison-price'),
      element('p', `Plazo inicial: ${option.estimatedDays} días de trabajo.`, 'comparison-detail'),
      element('p', differenceLabel(option), 'comparison-detail'),
      button,
    );
    return card;
  }));
}
