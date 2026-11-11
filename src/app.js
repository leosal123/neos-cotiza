import { createDefaultQuote, normalizeQuote, calculateQuote } from './quote.js';
import {
  MAX_IMPORT_BYTES, encodeQuote, decodeQuote, loadDraft, saveDraft, removeDraft,
} from './storage.js';
import { byId, element, createNotifier, openDialog } from './ui/dom.js';
import { createQuoteForm, syncCatalog } from './ui/form.js';
import { renderSummary } from './ui/summary.js';
import { renderProposal } from './ui/proposal.js';
import { renderComparison } from './ui/comparison.js';

const form = createQuoteForm();
const notify = createNotifier();
let quote = createDefaultQuote();
let calculation = calculateQuote(quote);
let savedCandidate = null;

// El guardado es opcional y cualquier error permite seguir editando.
function saveIfEnabled() {
  if (!byId('save-locally').checked) return;
  const result = saveDraft(quote);
  byId('storage-status').textContent = result.ok
    ? 'Borrador guardado solo en este navegador.' : result.message;
  if (!result.ok) byId('save-locally').checked = false;
}

function updateQuote(next) {
  calculation = calculateQuote(next);
  quote = calculation.quote;
  renderSummary(calculation);
  renderComparison(quote, selectService);
  saveIfEnabled();
}

function applyQuote(next) {
  quote = normalizeQuote(next);
  form.sync(quote);
  form.clearValidation();
  updateQuote(quote);
}

function selectService(serviceId) {
  applyQuote({ ...quote, serviceId });
  notify('Opción aplicada. Se conservaron tus extras y condiciones.');
  byId(`comparison-${quote.serviceId}`).focus({ preventScroll: true });
}

function showProposal() {
  if (!form.validate(quote)) return;
  renderProposal(calculation);
  openDialog('proposal-dialog', notify);
}

function startNewQuote() {
  applyQuote(createDefaultQuote());
  byId('reset-dialog').close();
  notify('Nueva propuesta lista para editar.');
  form.fields.projectName.focus();
}

function clearLocalDraft() {
  const result = removeDraft();
  if (result.ok) {
    savedCandidate = null;
    byId('save-locally').checked = false;
    byId('restore-banner').hidden = true;
    byId('storage-status').textContent =
      'Sin borrador guardado. La propuesta abierta sigue disponible.';
  }
  notify(result.ok ? 'Borrador local eliminado.' : result.message, !result.ok);
}

function toggleLocalSave() {
  if (byId('save-locally').checked) {
    savedCandidate = null;
    byId('restore-banner').hidden = true;
    saveIfEnabled();
    return;
  }
  const result = removeDraft();
  byId('storage-status').textContent = result.ok
    ? 'Guardado desactivado. El borrador local se eliminó.' : result.message;
  if (!result.ok) notify(result.message, true);
}

function restoreLocalDraft() {
  if (!savedCandidate) return;
  byId('save-locally').checked = true;
  applyQuote(savedCandidate);
  savedCandidate = null;
  byId('restore-banner').hidden = true;
  notify('Borrador recuperado.');
}

// Solo se descarga estado editable; los importes se recalculan al importar.
function downloadQuote() {
  if (!form.validate(quote)) return;
  const file = new Blob([encodeQuote(quote)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(file);
  const anchor = element('a');
  anchor.href = url;
  anchor.download = `neos-cotiza-${quote.issuedDate}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  notify('Cotización descargada. Incluye los textos de tu propuesta.');
}

async function importQuote(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > MAX_IMPORT_BYTES) {
      throw new Error('El archivo supera el límite de 64 KB.');
    }
    applyQuote(decodeQuote(await file.text()));
    notify('Cotización importada. Los importes se recalcularon con el catálogo actual.');
  } catch (error) {
    notify(error instanceof Error ? error.message : 'No se pudo importar la cotización.', true);
  }
}

// La aplicación coordina eventos; cada módulo renderiza su parte con nodos seguros.
form.onInput(() => {
  form.clearValidation();
  updateQuote(form.read());
});
for (const [id, delta] of [['pages-minus', -1], ['pages-plus', 1]]) {
  byId(id).addEventListener('click', () => {
    form.fields.extraPages.value = String(Math.max(0, Math.min(20, quote.extraPages + delta)));
    updateQuote(form.read());
  });
}

byId('preview-button').addEventListener('click', showProposal);
byId('download-button').addEventListener('click', downloadQuote);
byId('print-button').addEventListener('click', () => {
  renderProposal(calculation);
  window.print();
});
window.addEventListener('beforeprint', () => renderProposal(calculation));
byId('reset-button').addEventListener('click', () => openDialog('reset-dialog', notify));
byId('confirm-reset').addEventListener('click', startNewQuote);
for (const id of ['guide-button', 'mobile-guide-button']) {
  byId(id).addEventListener('click', () => openDialog('guide-dialog', notify));
}
for (const id of ['import-button', 'mobile-import-button']) {
  byId(id).addEventListener('click', () => byId('import-file').click());
}
document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => byId(button.dataset.close).close());
});
byId('save-locally').addEventListener('change', toggleLocalSave);
byId('clear-storage').addEventListener('click', clearLocalDraft);
byId('discard-button').addEventListener('click', clearLocalDraft);
byId('restore-button').addEventListener('click', restoreLocalDraft);
byId('import-file').addEventListener('change', importQuote);

syncCatalog();
form.sync(quote);
updateQuote(quote);
renderProposal(calculation);
const draft = loadDraft();
if (draft.ok && draft.quote) {
  savedCandidate = draft.quote;
  byId('restore-banner').hidden = false;
} else if (!draft.ok) {
  byId('storage-status').textContent = draft.message;
}
