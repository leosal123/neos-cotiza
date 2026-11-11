import { formatMoney } from '../quote.js';
import { byId, moneyRow } from './dom.js';

export function renderSummary(calculation) {
  const { quote } = calculation;
  byId('summary-project').textContent = quote.projectName || 'Tu próximo proyecto';
  byId('summary-lines').replaceChildren(
    ...calculation.lines.map((line) => moneyRow(line.label, formatMoney(line.amountCents))),
  );
  const adjustments = [];
  if (quote.discountPercent > 0) {
    adjustments.push(moneyRow(
      `Descuento (${quote.discountPercent}%)`,
      `− ${formatMoney(calculation.discountCents)}`,
    ));
  }
  if (quote.taxPercent > 0) {
    adjustments.push(moneyRow(`Impuesto (${quote.taxPercent}%)`, formatMoney(calculation.taxCents)));
  }
  byId('summary-adjustments').replaceChildren(...adjustments);
  byId('total').textContent = formatMoney(calculation.totalCents);
  byId('advance-percent').textContent = `(${quote.advancePercent}%)`;
  byId('advance-amount').textContent = formatMoney(calculation.advanceCents);
  byId('balance-amount').textContent = formatMoney(calculation.balanceCents);
  byId('estimated-days').textContent =
    `${calculation.estimatedDays} ${calculation.estimatedDays === 1 ? 'día' : 'días'} de trabajo`;
  byId('pages-minus').disabled = quote.extraPages === 0;
  byId('pages-plus').disabled = quote.extraPages === 20;
}
