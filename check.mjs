import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MIME_TYPES, PUBLIC_FILES } from './project-files.mjs';
import { CONTENT_SECURITY_POLICY } from './server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_PATHS = new Set(PUBLIC_FILES);
const SCRIPT_FILES = ['scripts/server.mjs', 'scripts/build.mjs', 'scripts/check.mjs', 'scripts/project-files.mjs', 'scripts/package.mjs'];
// Las pruebas forman parte del repositorio: se escanean igual que la app.
// dist se revisa aunque sea generado; work contiene solo muestras temporales ignoradas.
const EXCLUDED_DIRECTORIES = new Set(['.git', 'node_modules', 'work']);
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.html', '.css', '.svg', '.json', '.md', '.txt', '.yml', '.yaml', '.toml']);

async function readRegular(relative, encoding = 'utf8') {
  let filename = ROOT;
  const parts = relative.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    filename = path.join(filename, parts[index]);
    const info = await lstat(filename);
    if (info.isSymbolicLink() || (index === parts.length - 1 ? !info.isFile() : !info.isDirectory())) {
      throw new Error(`Ruta local no válida: ${relative}`);
    }
  }
  return readFile(filename, encoding);
}

export function localReference(value, owner) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(trimmed) || trimmed.startsWith('//') || /[\\\u0000-\u001f]/u.test(trimmed)) {
    throw new Error(`Referencia externa o no válida en ${owner}.`);
  }
  let decoded;
  try {
    decoded = decodeURIComponent(trimmed.split(/[?#]/u, 1)[0]);
  } catch {
    throw new Error(`Referencia mal codificada en ${owner}.`);
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(decoded) || decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/u.test(decoded)) {
    throw new Error(`Referencia fuera del proyecto en ${owner}.`);
  }
  const relative = path.posix.normalize(decoded === '/' ? 'index.html' : decoded.startsWith('/')
    ? decoded.slice(1)
    : path.posix.join(path.posix.dirname(owner), decoded));
  if (relative === '..' || relative.startsWith('../') || path.posix.isAbsolute(relative)) {
    throw new Error(`Referencia fuera del proyecto en ${owner}.`);
  }
  if (!PUBLIC_PATHS.has(relative)) throw new Error(`Recurso público no permitido en ${owner}: ${relative}`);
  return relative;
}

function attributes(tag) {
  const result = new Map();
  const source = tag.replace(/^<[a-z][\w:-]*/iu, '').replace(/\/?\s*>$/u, '');
  for (const match of source.matchAll(/([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu)) {
    const name = match[1].toLowerCase();
    if (result.has(name)) throw new Error(`Atributo HTML duplicado: ${name}`);
    result.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

function policyDirectives(policy) {
  const result = new Map();
  for (const part of policy.split(';').map((item) => item.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/u);
    if (result.has(name)) throw new Error('La política CSP contiene directivas duplicadas.');
    result.set(name, values.join(' '));
  }
  return result;
}

function* htmlTags(html) {
  const tags = /<(\/?)([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu;
  const rawText = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes']);
  let match;
  while ((match = tags.exec(html)) !== null) {
    const name = match[2].toLowerCase();
    const closing = match[1] === '/';
    yield { name, closing, tag: match[0] };
    if (!closing && rawText.has(name)) {
      // Dentro de estos elementos el navegador trata <meta ...> como texto.
      const close = new RegExp(`</${name}\\s*>`, 'giu');
      close.lastIndex = tags.lastIndex;
      const end = close.exec(html);
      if (!end) return;
      tags.lastIndex = end.index + end[0].length;
    }
  }
}

export function checkHtml(source) {
  // Un comentario o una cadena de texto no acreditan la existencia de un meta.
  const html = source.replace(/<!--[\s\S]*?(?:-->|$)/gu, '');
  if (!/<!doctype\s+html\s*>/iu.test(html)) throw new Error('index.html debe declarar HTML5.');
  if (!/<html\b[^>]*\blang\s*=\s*["']es(?:-[a-z]+)?["']/iu.test(html)) throw new Error('Falta el idioma español en index.html.');
  const references = new Set();
  const policies = [];
  let moduleFound = false;
  let scriptCount = 0;
  let inHead = false;
  let templateDepth = 0;
  for (const { name, closing, tag } of htmlTags(html)) {
    if (closing) {
      if (name === 'head' && templateDepth === 0) inHead = false;
      if (name === 'template') templateDepth = Math.max(0, templateDepth - 1);
      continue;
    }
    if (name === 'head' && templateDepth === 0) inHead = true;
    if (name === 'template') templateDepth += 1;
    const attrs = attributes(tag);
    if (['base', 'style'].includes(name) || [...attrs.keys()].some((key) => key === 'style' || key === 'srcdoc' || /^on[a-z]+$/u.test(key))) {
      throw new Error('index.html contiene estilos, eventos o contenido incrustado incompatible con CSP.');
    }
    if (attrs.has('srcset')) throw new Error('Usa recursos src locales simples en index.html.');
    for (const key of ['src', 'href', 'poster', 'action']) {
      if (!attrs.has(key)) continue;
      const relative = localReference(attrs.get(key), 'index.html');
      if (relative) references.add(relative);
    }
    if (name === 'meta' && inHead && templateDepth === 0 && attrs.get('http-equiv')?.toLowerCase() === 'content-security-policy') {
      policies.push(policyDirectives(attrs.get('content') ?? ''));
    }
    if (name === 'script') {
      scriptCount += 1;
      if (attrs.get('type') === 'module' && localReference(attrs.get('src') ?? '', 'index.html') === 'src/app.js') moduleFound = true;
    }
  }
  if (policies.length !== 1) throw new Error('index.html debe incluir exactamente un meta Content-Security-Policy real.');
  const expectedPolicy = policyDirectives(CONTENT_SECURITY_POLICY);
  // frame-ancestors solo funciona en la cabecera HTTP, no en un meta HTML.
  expectedPolicy.delete('frame-ancestors');
  const actualPolicy = policies[0];
  if (actualPolicy.size !== expectedPolicy.size || [...expectedPolicy].some(([name, value]) => actualPolicy.get(name) !== value)) {
    throw new Error('El meta Content-Security-Policy no conserva la política local estricta.');
  }
  for (const required of [...PUBLIC_FILES.filter((relative) => relative.endsWith('.css')), 'assets/brand/neos-linx-isotipo.webp', 'src/app.js']) {
    if (!references.has(required)) throw new Error(`Falta la referencia local obligatoria: ${required}`);
  }
  let closedScripts = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu)) {
    closedScripts += 1;
    if (match[2].trim() || !/\bsrc\s*=/iu.test(match[1])) throw new Error('Los scripts deben estar en archivos locales.');
  }
  if (closedScripts !== scriptCount) throw new Error('Los scripts deben cerrar su etiqueta y usar archivos locales.');
  if (!moduleFound) throw new Error('Falta el punto de entrada con type="module".');
}

export function checkCss(source, owner) {
  const css = source.replace(/\/\*[\s\S]*?\*\//gu, '');
  if (/@import\b/iu.test(css)) throw new Error(`No se permiten importaciones CSS en ${owner}.`);
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/giu)) {
    localReference(match[1] ?? match[2] ?? match[3], owner);
  }
}

export function checkImports(source, owner) {
  for (const match of source.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)["']([^"']+)["']/gu)) {
    if (!match[1].startsWith('./') && !match[1].startsWith('../')) throw new Error(`Importación no local en ${owner}.`);
    localReference(match[1], owner);
  }
}

export async function scanSecrets(directory = ROOT, prefix = '') {
  const flagged = [];
  // El resultado solo identifica nombres de archivo; nunca imprime coincidencias.
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u,
    /\bAKIA[0-9A-Z]{16}\b/u,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/u,
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/u,
    /(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[:=]\s*["'][^"'\r\n]{12,}["']/iu,
  ];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Enlace simbólico no permitido: ${relative}`);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) flagged.push(...await scanSecrets(path.join(directory, entry.name), relative));
      continue;
    }
    if (!entry.isFile()) continue;
    if (/^\.env(?:\.|$)|\.(?:pem|key|p12|pfx)$/iu.test(entry.name)) {
      flagged.push(relative);
      continue;
    }
    if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const info = await lstat(path.join(directory, entry.name));
    if (info.size > 2 * 1024 * 1024) throw new Error(`Archivo demasiado grande para la revisión local: ${relative}`);
    const content = await readFile(path.join(directory, entry.name), 'utf8');
    if (patterns.some((pattern) => pattern.test(content))) flagged.push(relative);
  }
  return flagged;
}

async function check() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Se requiere Node.js 22 o posterior.');
  const files = new Map();
  if (PUBLIC_PATHS.size !== PUBLIC_FILES.length) throw new Error('El manifiesto público contiene rutas duplicadas.');
  for (const relative of PUBLIC_FILES) {
    if (relative.startsWith('/') || relative.split('/').some((part) => !part || part === '.' || part === '..') || relative.includes('\\') || !MIME_TYPES[path.posix.extname(relative)]) {
      throw new Error(`Ruta pública no válida en el manifiesto: ${relative}`);
    }
  }
  for (const relative of [...PUBLIC_FILES, ...SCRIPT_FILES]) {
    const isText = TEXT_EXTENSIONS.has(path.posix.extname(relative));
    files.set(relative, await readRegular(relative, isText ? 'utf8' : null));
  }
  for (const relative of [...PUBLIC_FILES, ...SCRIPT_FILES].filter((file) => /\.[cm]?js$/u.test(file))) {
    try {
      execFileSync(process.execPath, ['--check', path.join(ROOT, ...relative.split('/'))], { stdio: 'pipe' });
    } catch {
      throw new Error(`Sintaxis JavaScript no válida: ${relative}`);
    }
  }
  checkHtml(files.get('index.html'));
  for (const relative of PUBLIC_FILES.filter((file) => file.endsWith('.css'))) checkCss(files.get(relative), relative);
  for (const relative of PUBLIC_FILES) {
    if (relative.endsWith('.js')) checkImports(files.get(relative), relative);
  }
  const manifest = JSON.parse(await readRegular('package.json'));
  if (Object.keys(manifest.dependencies ?? {}).length || Object.keys(manifest.devDependencies ?? {}).length) {
    throw new Error('Este proyecto no debe tener dependencias de terceros.');
  }
  const flagged = await scanSecrets();
  if (flagged.length) throw new Error(`Revisar posibles secretos en estos archivos: ${flagged.join(', ')}`);
  console.log('Verificación correcta: sintaxis, recursos locales, CSP y revisión limitada de secretos.');
}

// Importar el detector desde sus pruebas no ejecuta la comprobación completa.
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    await check();
  } catch (error) {
    const detail = error.code === 'ENOENT' ? 'Falta un archivo requerido del proyecto.' : error.message;
    console.error(`Verificación fallida: ${detail}`);
    process.exitCode = 1;
  }
}
