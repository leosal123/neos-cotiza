import { formatMoney } from '../quote.js';
import { byId, element, definitionRow } from './dom.js';

function dateLabel(iso) {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(`${iso}T12:00:00Z`));
}

function expiryDate(quote) {
  const date = new Date(`${quote.issuedDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + quote.validityDays);
  return dateLabel(date.toISOString().slice(0, 10));
}

export function renderProposal(calculation) {
  const { quote } = calculation;
  byId('proposal-title').textContent = quote.projectName || 'Tu proyecto web';
  byId('proposal-recipient').textContent = quote.recipient
    ? `Preparado para ${quote.recipient}` : 'Propuesta personalizada';
  byId('proposal-meta').replaceChildren(
    definitionRow('Emisión', dateLabel(quote.issuedDate)),
    definitionRow('Válida hasta', expiryDate(quote)),
    definitionRow('Moneda', 'Soles peruanos (PEN)'),
  );
  byId('proposal-rows').replaceChildren(...calculation.lines.map((line) => {
    const row = element('tr');
    row.append(element('td', line.label), element('td', formatMoney(line.amountCents)));
    return row;
  }));

  const totals = [definitionRow('Subtotal', formatMoney(calculation.subtotalCents))];
  if (quote.discountPercent > 0) {
    totals.push(definitionRow(
      `Descuento (${quote.discountPercent}%)`,
      `− ${formatMoney(calculation.discountCents)}`,
    ));
  }
  if (quote.taxPercent > 0) {
    totals.push(definitionRow(`Impuesto (${quote.taxPercent}%)`, formatMoney(calculation.taxCents)));
  }
  totals.push(definitionRow('Total', formatMoney(calculation.totalCents), 'grand-total'));
  byId('proposal-totals').replaceChildren(...totals);
  byId('proposal-notes').textContent = quote.notes
    || 'El alcance definitivo se coordina antes de iniciar el proyecto.';
  byId('proposal-payment').textContent =
    `Adelanto del ${quote.advancePercent}%: ${formatMoney(calculation.advanceCents)}. `
    + `Saldo al entregar: ${formatMoney(calculation.balanceCents)}.`;
  byId('proposal-timing').textContent =
    `Plazo inicial estimado: ${calculation.estimatedDays} días de trabajo, `
    + 'sujeto a coordinación y entrega de contenido. '
    + 'Las páginas adicionales y la prioridad requieren acordar el calendario.';
}
