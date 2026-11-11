// Las entradas se muestran como texto, nunca como marcado ejecutable.
export const byId = (id) => document.getElementById(id);

export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function moneyRow(label, amount, className) {
  const row = element('div', undefined, className);
  row.append(element('span', label), element('span', amount));
  return row;
}

export function definitionRow(label, value, className) {
  const row = element('div', undefined, className);
  row.append(element('dt', label), element('dd', value));
  return row;
}

export function createNotifier() {
  let timer;
  return (message, error = false) => {
    const toast = byId('toast');
    clearTimeout(timer);
    toast.textContent = message;
    toast.dataset.error = String(error);
    toast.hidden = false;
    timer = setTimeout(() => { toast.hidden = true; }, error ? 6500 : 4200);
  };
}

export function openDialog(id, notify) {
  const dialog = byId(id);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else notify('Esta vista requiere un navegador actualizado. Puedes descargar la cotización.', true);
}
