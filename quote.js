import { CATALOG } from './catalog.js';

const DEFAULT_EXTRA_IDS = ['contenido', 'seo'];
const MONEY_FORMAT = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// La fecha de emisión sigue el día de Lima, aunque el navegador esté en otra zona.
function limaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type) => parts.find((entry) => entry.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function createDefaultQuote() {
  return {
    serviceId: 'landing',
    extraIds: [...DEFAULT_EXTRA_IDS],
    extraPages: 0,
    priority: false,
    discountPercent: 0,
    taxPercent: 0,
    advancePercent: 50,
    projectName: 'Sitio web para Estudio Oliva',
    recipient: 'Estudio Oliva · ejemplo ficticio',
    notes: 'Diseño adaptable a celular, revisión de contenido y acompañamiento de entrega.',
    issuedDate: limaDate(),
    validityDays: 15,
  };
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  try {
    return Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

// Solo se leen propiedades propias de datos; no se ejecutan getters del estado.
function ownValue(object, key) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function finiteNumber(value, fallback) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedNumber(value, fallback, min, max, integer = false) {
  const bounded = Math.min(max, Math.max(min, finiteNumber(value, fallback)));
  return integer ? Math.trunc(bounded) : Math.round(bounded * 100) / 100;
}

function cleanText(value, fallback, maxLength) {
  if (typeof value !== 'string') return fallback;
  // Se eliminan controles y marcas invisibles que pueden alterar la lectura.
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .replace(/[\ud800-\udbff]$/, '');
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthDays[month - 1];
}

function catalogError(message) {
  throw new TypeError(`Catálogo inválido: ${message}`);
}

// El catálogo es configuración local: los errores se explican en vez de producir NaN.
function validateCatalog(catalog) {
  if (!isPlainObject(catalog) || !Array.isArray(catalog.services) || !catalog.services.length
    || !Array.isArray(catalog.extras)) catalogError('faltan servicios o extras.');

  for (const group of [catalog.services, catalog.extras]) {
    const ids = new Set();
    for (const item of group) {
      if (!isPlainObject(item) || typeof item.id !== 'string' || !item.id
        || ids.has(item.id) || typeof item.name !== 'string' || !item.name) {
        catalogError('cada opción necesita un id único y un nombre.');
      }
      ids.add(item.id);
      if (!Number.isSafeInteger(item.price) || item.price < 0
        || !Number.isSafeInteger(item.price * 100)) {
        catalogError('los precios deben ser soles enteros no negativos y seguros.');
      }
      if (!Number.isSafeInteger(item.days) || item.days < 0) {
        catalogError('los plazos deben ser días enteros no negativos.');
      }
    }
  }
  if (!Number.isSafeInteger(catalog.extraPagePrice) || catalog.extraPagePrice < 0
    || !Number.isSafeInteger(catalog.extraPagePrice * 100)) {
    catalogError('el precio por página debe ser un entero no negativo y seguro.');
  }
  if (typeof catalog.priorityPercent !== 'number' || !Number.isFinite(catalog.priorityPercent)
    || catalog.priorityPercent < 0 || catalog.priorityPercent > 100) {
    catalogError('el recargo por prioridad debe estar entre 0 y 100.');
  }
}

export function normalizeQuote(input, catalog = CATALOG) {
  validateCatalog(catalog);
  const defaults = createDefaultQuote();
  const source = isPlainObject(input) ? input : {};
  const read = (key) => ownValue(source, key);
  const serviceIds = new Set(catalog.services.map((item) => item.id));
  const defaultServiceId = serviceIds.has(defaults.serviceId)
    ? defaults.serviceId : catalog.services[0].id;
  const serviceId = read('serviceId');
  const rawExtras = read('extraIds');
  const selectedExtras = new Set();

  if (Array.isArray(rawExtras)) {
    // Acota también el trabajo ante un archivo local accidentalmente enorme.
    for (let index = 0; index < Math.min(rawExtras.length, 1000); index += 1) {
      const id = ownValue(rawExtras, String(index));
      if (typeof id === 'string') selectedExtras.add(id);
    }
  } else {
    DEFAULT_EXTRA_IDS.forEach((id) => selectedExtras.add(id));
  }

  const issuedDate = read('issuedDate');
  return {
    serviceId: typeof serviceId === 'string' && serviceIds.has(serviceId)
      ? serviceId : defaultServiceId,
    // El orden del catálogo hace que el resultado sea estable y elimina duplicados.
    extraIds: catalog.extras.filter((item) => selectedExtras.has(item.id)).map((item) => item.id),
    extraPages: boundedNumber(read('extraPages'), defaults.extraPages, 0, 20, true),
    priority: read('priority') === true,
    discountPercent: boundedNumber(read('discountPercent'), defaults.discountPercent, 0, 40),
    taxPercent: boundedNumber(read('taxPercent'), defaults.taxPercent, 0, 30),
    advancePercent: boundedNumber(read('advancePercent'), defaults.advancePercent, 0, 100),
    projectName: cleanText(read('projectName'), defaults.projectName, 120),
    recipient: cleanText(read('recipient'), defaults.recipient, 120),
    notes: cleanText(read('notes'), defaults.notes, 2000),
    issuedDate: validDate(issuedDate) ? issuedDate : defaults.issuedDate,
    validityDays: boundedNumber(read('validityDays'), defaults.validityDays, 1, 90, true),
  };
}

function safeInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('El cálculo supera el rango de importes o plazos seguros.');
  }
  return value;
}

// Los porcentajes se expresan en centésimas y se redondea cada línea al céntimo.
// BigInt evita perder precisión en la multiplicación antes del redondeo.
function percentageOf(cents, percent) {
  const basisPoints = Math.round(percent * 100);
  const rounded = (BigInt(cents) * BigInt(basisPoints) + 5000n) / 10000n;
  return safeInteger(Number(rounded));
}

export function calculateQuote(input, catalog = CATALOG) {
  const quote = normalizeQuote(input, catalog);
  const service = catalog.services.find((item) => item.id === quote.serviceId);
  const extras = catalog.extras.filter((item) => quote.extraIds.includes(item.id));
  const baseCents = service.price * 100;
  const extrasCents = safeInteger(extras.reduce((sum, item) => sum + item.price * 100, 0));
  const pagesCents = safeInteger(quote.extraPages * catalog.extraPagePrice * 100);
  const beforePriorityCents = safeInteger(baseCents + extrasCents + pagesCents);
  const priorityCents = quote.priority
    ? percentageOf(beforePriorityCents, catalog.priorityPercent) : 0;
  const subtotalCents = safeInteger(beforePriorityCents + priorityCents);
  const discountCents = percentageOf(subtotalCents, quote.discountPercent);
  const taxableCents = subtotalCents - discountCents;
  const taxCents = percentageOf(taxableCents, quote.taxPercent);
  const totalCents = safeInteger(taxableCents + taxCents);
  const advanceCents = percentageOf(totalCents, quote.advancePercent);
  const balanceCents = totalCents - advanceCents;
  const estimatedDays = safeInteger(extras.reduce((sum, item) => sum + item.days, service.days));
  const lines = [
    { id: `service:${service.id}`, label: service.name, amountCents: baseCents },
    ...extras.map((item) => ({ id: `extra:${item.id}`, label: item.name, amountCents: item.price * 100 })),
  ];

  if (quote.extraPages > 0) {
    lines.push({
      id: 'pages',
      label: `${quote.extraPages} ${quote.extraPages === 1 ? 'página adicional' : 'páginas adicionales'}`,
      amountCents: pagesCents,
    });
  }
  if (quote.priority) {
    lines.push({ id: 'priority', label: 'Prioridad de entrega', amountCents: priorityCents });
  }

  return {
    quote,
    lines,
    baseCents,
    extrasCents,
    pagesCents,
    priorityCents,
    subtotalCents,
    discountCents,
    taxCents,
    totalCents,
    advanceCents,
    balanceCents,
    estimatedDays,
  };
}

export function formatMoney(cents) {
  if (!Number.isSafeInteger(cents)) throw new TypeError('El importe debe ser céntimos enteros seguros.');
  return MONEY_FORMAT.format(cents / 100);
}
