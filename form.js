import { CATALOG } from '../catalog.js';
import { normalizeQuote, formatMoney } from '../quote.js';
import { byId, element } from './dom.js';

const FIELD_IDS = {
  projectName: 'project-name',
  recipient: 'recipient',
  notes: 'notes',
  issuedDate: 'issued-date',
  validityDays: 'validity-days',
  extraPages: 'extra-pages',
  discountPercent: 'discount',
  taxPercent: 'tax',
  advancePercent: 'advance',
};

export function createQuoteForm() {
  const fields = Object.fromEntries(
    Object.entries(FIELD_IDS).map(([key, id]) => [key, byId(id)]),
  );

  function read() {
    const next = Object.fromEntries(
      Object.entries(fields).map(([key, input]) => [key, input.value]),
    );
    next.serviceId = document.querySelector('[name="service"]:checked')?.value;
    next.extraIds = [...document.querySelectorAll('[name="extra"]:checked')]
      .map((input) => input.value);
    next.priority = byId('priority').checked;
    return normalizeQuote(next);
  }

  function sync(quote) {
    // Conserva adelantos importados distintos de los atajos del menú.
    const advance = fields.advancePercent;
    advance.querySelectorAll('[data-custom]').forEach((option) => option.remove());
    if (![...advance.options].some((option) => Number(option.value) === quote.advancePercent)) {
      const option = element('option', `${quote.advancePercent}% del total`);
      option.value = String(quote.advancePercent);
      option.dataset.custom = 'true';
      advance.append(option);
    }
    for (const [key, input] of Object.entries(fields)) input.value = String(quote[key]);
    document.querySelectorAll('[name="service"]').forEach((input) => {
      input.checked = input.value === quote.serviceId;
    });
    document.querySelectorAll('[name="extra"]').forEach((input) => {
      input.checked = quote.extraIds.includes(input.value);
    });
    byId('priority').checked = quote.priority;
  }

  function validate(quote) {
    for (const input of Object.values(fields)) {
      if (!input.reportValidity()) return false;
    }
    if (quote.projectName) return true;
    fields.projectName.setCustomValidity('Escribe un nombre para el proyecto.');
    fields.projectName.reportValidity();
    return false;
  }

  function onInput(listener) {
    document.querySelectorAll('.editor input,.editor textarea,.editor select')
      .forEach((input) => input.addEventListener('input', listener));
  }

  const clearValidation = () => fields.projectName.setCustomValidity('');
  return { fields, read, sync, validate, onInput, clearValidation };
}

// Los precios visibles proceden de la misma configuración que el cálculo.
export function syncCatalog() {
  for (const service of CATALOG.services) {
    const price = document.querySelector(`[data-service-price="${service.id}"]`);
    if (price) {
      price.replaceChildren(
        document.createTextNode(formatMoney(service.price * 100)),
        element('span', 'precio base'),
      );
    }
  }
  for (const extra of CATALOG.extras) {
    const price = document.querySelector(`[data-extra-price="${extra.id}"]`);
    if (price) price.textContent = `+ ${formatMoney(extra.price * 100)}`;
  }
  byId('pages-hint').textContent =
    `${formatMoney(CATALOG.extraPagePrice * 100)} por página · hasta 20`;
  document.querySelector('.priority-row>span:first-child>span').textContent =
    `Recargo de ejemplo del ${CATALOG.priorityPercent}%. Plazo sujeto a coordinación.`;
}
