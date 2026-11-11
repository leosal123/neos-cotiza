import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { scanSecrets } from './check.mjs';
import { PUBLIC_FILES } from './project-files.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT_FILES = Object.freeze([
  '.gitignore', 'CONTRIBUTING.md', 'README.md', 'SECURITY.md',
  'package.json', 'package-lock.json', 'index.html',
]);
const SOURCE_DIRS = Object.freeze(['.github', 'assets', 'docs', 'scripts', 'src', 'styles', 'tests', 'examples']);
const SOURCE_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yml', '.yaml', '.html', '.css', '.js', '.mjs', '.cjs', '.svg', '.webp', '.png', '.jpg', '.jpeg', '.woff2', '.pdf']);
const PRIVATE_DIRECTORIES = new Set(['.git', 'node_modules', 'work', 'dist', 'release', 'private', 'exports', 'env', 'log', 'logs', 'backup', 'backups', 'coverage', 'test-results']);
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 10;
const UTF8_FLAG = 0x0800;
const FILE_MODE = (0o100644 << 16) >>> 0;
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ value) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function sorted(values) {
  return [...values].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

function validateRelative(relative) {
  if (typeof relative !== 'string' || !relative || relative !== relative.normalize('NFC') || Buffer.from(relative).toString('utf8') !== relative
    || /[\\\u0000-\u001f\u007f<>:"|?*%#]/u.test(relative) || relative.startsWith('/')
    || relative.split('/').some((part) => !part || part === '.' || part === '..' || /[. ]$/u.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
    throw new Error(`Ruta de archivo no permitida: ${String(relative)}`);
  }
  if (Buffer.byteLength(relative) > 0xffff) throw new Error('Nombre demasiado largo para ZIP32.');
  return relative;
}

function validateSourceName(relative, isDirectory) {
  validateRelative(relative);
  const parts = relative.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part.startsWith('.') && !(index === 0 && part === '.github') && relative !== '.gitignore') {
      throw new Error(`Archivo o carpeta oculta no permitida en la entrega: ${relative}`);
    }
    if (PRIVATE_DIRECTORIES.has(part.toLowerCase()) || /^(?:private|exports?|backups?)(?:[._-]|$)/iu.test(part)) {
      throw new Error(`Ruta privada no permitida en la entrega: ${relative}`);
    }
  }
  if (isDirectory) return;
  const basename = parts.at(-1);
  const extension = path.posix.extname(basename).toLowerCase();
  if (/^(?:credentials?|secrets?|passwords?|id_rsa|id_ed25519|env)(?:[._-]|$)/iu.test(basename)
    || (/^(?:(?:access|refresh|auth)[_-]?)?tokens?(?:[._-]|$)/iu.test(basename) && ['.txt', '.json', '.yml', '.yaml'].includes(extension))
    || /^(?:cotizacion-|neos-cotiza-)/iu.test(basename)
    || /\.(?:pem|key|p12|pfx|keystore|jks|sqlite3?|db|log|bak|backup|old|orig|tmp|temp|swp|swo|zip|7z|rar|tar|gz|tgz)$/iu.test(basename)
    || (relative !== '.gitignore' && !SOURCE_EXTENSIONS.has(extension))
    || (extension === '.pdf' && relative !== 'examples/propuesta-ejemplo.pdf')) {
    throw new Error(`Nombre privado o tipo de archivo no permitido: ${relative}`);
  }
}

async function optionalInfo(filename) {
  try {
    return await lstat(filename);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function validateDirectoryChain(directory) {
  const absolute = path.resolve(directory);
  if (process.platform === 'win32' && absolute.startsWith('\\\\')) throw new Error('La entrega requiere una carpeta local.');
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('La ruta requiere carpetas locales sin enlaces simbólicos.');
  }
  return absolute;
}

async function readRegular(root, relative) {
  validateRelative(relative);
  const parts = relative.split('/');
  let current = root;
  let expected;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    expected = await lstat(current);
    if (expected.isSymbolicLink() || (index === parts.length - 1 ? !expected.isFile() : !expected.isDirectory())) {
      throw new Error(`Ruta local no válida o enlace simbólico: ${relative}`);
    }
  }
  if (expected.size > MAX_FILE_BYTES) throw new Error(`Archivo demasiado grande para esta entrega: ${relative}`);
  const resolved = await realpath(current);
  const inside = path.relative(root, resolved);
  if (!inside || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) throw new Error(`Archivo fuera del proyecto: ${relative}`);
  const handle = await open(current, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const actual = await handle.stat();
    if (!actual.isFile() || actual.dev !== expected.dev || actual.ino !== expected.ino || actual.size !== expected.size) {
      throw new Error(`El archivo cambió durante la lectura: ${relative}`);
    }
    const bytes = await handle.readFile();
    if (bytes.length !== expected.size) throw new Error(`El archivo cambió durante la lectura: ${relative}`);
    return bytes;
  } finally {
    await handle.close();
  }
}

async function collectSource(root) {
  const files = new Map();
  let total = 0;
  async function add(relative) {
    validateSourceName(relative, false);
    const bytes = await readRegular(root, relative);
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES || files.size >= 4096) throw new Error('La entrega supera el límite local de tamaño o cantidad de archivos.');
    files.set(relative, bytes);
  }
  async function walk(relative) {
    validateSourceName(relative, true);
    const directory = path.join(root, ...relative.split('/'));
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Carpeta fuente no válida o enlace simbólico: ${relative}`);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const name of sorted(entries.map((entry) => entry.name))) {
      const entry = entries.find((item) => item.name === name);
      const child = `${relative}/${name}`;
      if (entry.isSymbolicLink()) throw new Error(`Enlace simbólico no permitido: ${child}`);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) await add(child);
      else throw new Error(`Tipo de archivo no permitido: ${child}`);
    }
  }
  for (const relative of SOURCE_ROOT_FILES) await add(relative);
  for (const relative of SOURCE_DIRS) await walk(relative);
  for (const required of [...PUBLIC_FILES, 'examples/README.md', 'examples/propuesta-ejemplo.pdf']) {
    if (!files.has(required)) throw new Error(`Falta un archivo requerido en las fuentes: ${required}`);
  }
  return files;
}

async function collectWeb(root, source) {
  const expected = new Set([...PUBLIC_FILES, '.nojekyll']);
  const directories = new Set([...expected].flatMap((relative) => {
    const parts = relative.split('/');
    return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
  }));
  const dist = path.join(root, 'dist');
  await validateDirectoryChain(dist);
  const files = new Map();
  async function walk(relative = '') {
    const entries = await readdir(relative ? path.join(dist, ...relative.split('/')) : dist, { withFileTypes: true });
    for (const entry of entries) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Enlace simbólico en dist: ${child}`);
      if (entry.isDirectory() && directories.has(child)) await walk(child);
      else if (entry.isFile() && expected.has(child)) files.set(child, await readRegular(dist, child));
      else throw new Error(`Contenido inesperado en dist: ${child}`);
    }
  }
  await walk();
  if (files.size !== expected.size || [...expected].some((relative) => !files.has(relative))) throw new Error('dist está incompleto. Ejecuta npm run build.');
  if (files.get('.nojekyll').length !== 0) throw new Error('El marcador .nojekyll debe estar vacío.');
  for (const relative of PUBLIC_FILES) {
    if (!files.get(relative).equals(source.get(relative))) throw new Error(`dist desactualizado: ${relative}. Ejecuta npm run build.`);
  }
  return files;
}

// ZIP32 sin dependencias: cabeceras locales y centrales completas, UTF-8,
// fecha fija y archivos Unix regulares 0644. No se crean entradas de directorio.
export function createZipArchive(entries) {
  if (!Array.isArray(entries) || entries.length >= 0xffff) throw new Error('Cantidad de entradas no válida para ZIP32.');
  const names = new Set();
  for (const entry of entries) {
    validateRelative(entry.name);
    const key = entry.name.toLowerCase();
    if (names.has(key)) throw new Error(`Nombre duplicado en ZIP: ${entry.name}`);
    names.add(key);
    if (!Buffer.isBuffer(entry.data) || entry.data.length > 0xffffffff) throw new Error('Datos de archivo no válidos para ZIP32.');
  }
  const ordered = [...entries].sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  let centralSize = 0;
  for (const { name, data } of ordered) {
    const filename = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);
    if (compressed.length > 0xffffffff || localOffset > 0xffffffff) throw new Error('La entrega requiere ZIP64, no admitido por este proyecto.');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(FILE_MODE, 38);
    central.writeUInt32LE(localOffset, 42);
    localParts.push(local, filename, compressed);
    centralParts.push(central, filename);
    localOffset += local.length + filename.length + compressed.length;
    centralSize += central.length + filename.length;
  }
  if (localOffset + centralSize + 22 > 0xffffffff) throw new Error('La entrega requiere ZIP64, no admitido por este proyecto.');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(ordered.length, 8);
  end.writeUInt16LE(ordered.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

async function validateRelease(root, owned) {
  const release = path.join(root, 'release');
  const info = await optionalInfo(release);
  if (!info) return release;
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('release debe ser una carpeta local sin enlaces simbólicos.');
  await validateDirectoryChain(release);
  for (const entry of await readdir(release, { withFileTypes: true })) {
    if (!owned.has(entry.name) || !entry.isFile() || entry.isSymbolicLink()) throw new Error(`Contenido inesperado en release: ${entry.name}. Revísalo antes de empaquetar.`);
    const fileInfo = await lstat(path.join(release, entry.name));
    if (fileInfo.nlink !== 1) throw new Error(`Archivo enlazado no permitido en release: ${entry.name}`);
  }
  return release;
}

async function writeOwned(release, filename, bytes) {
  await validateDirectoryChain(release);
  const destination = path.join(release, filename);
  const before = await optionalInfo(destination);
  if (before && (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1)) throw new Error(`Destino de entrega no válido: ${filename}`);
  const flags = before ? constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0) : constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL;
  const handle = await open(destination, flags, 0o644);
  try {
    const actual = await handle.stat();
    if (!actual.isFile() || actual.nlink !== 1 || (before && (actual.dev !== before.dev || actual.ino !== before.ino))) throw new Error(`El destino cambió durante la escritura: ${filename}`);
    await handle.truncate(0);
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
}

// Solo empaqueta archivos locales ya construidos; nunca despliega ni abre red.
export async function packageProject({ rootDirectory = PROJECT_ROOT } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Se requiere Node.js 22 o posterior.');
  const root = await validateDirectoryChain(rootDirectory);
  const source = await collectSource(root);
  const manifest = JSON.parse(source.get('package.json').toString('utf8'));
  const lock = JSON.parse(source.get('package-lock.json').toString('utf8'));
  if (manifest.name !== 'neos-cotiza' || !/^\d+\.\d+\.\d+$/u.test(manifest.version ?? '') || lock.name !== manifest.name || lock.version !== manifest.version || lock.packages?.['']?.version !== manifest.version) {
    throw new Error('Nombre o versión incoherente en package.json y package-lock.json.');
  }
  const flagged = await scanSecrets(root);
  if (flagged.length) throw new Error(`Revisar posibles secretos antes de empaquetar: ${flagged.join(', ')}`);
  const web = await collectWeb(root, source);
  const githubName = `neos-cotiza-v${manifest.version}-github.zip`;
  const webName = `neos-cotiza-v${manifest.version}-web.zip`;
  const owned = new Set([githubName, webName, 'SHA256SUMS.txt']);
  const release = await validateRelease(root, owned);
  const artifacts = [
    { filename: githubName, data: createZipArchive([...source].map(([name, data]) => ({ name: `neos-cotiza/${name}`, data }))) },
    { filename: webName, data: createZipArchive([...web].map(([name, data]) => ({ name, data }))) },
  ];
  for (const artifact of artifacts) artifact.sha256 = createHash('sha256').update(artifact.data).digest('hex');
  const sums = Buffer.from(artifacts.map(({ filename, sha256 }) => `${sha256}  ${filename}\n`).join(''), 'utf8');
  artifacts.push({ filename: 'SHA256SUMS.txt', data: sums, sha256: createHash('sha256').update(sums).digest('hex') });
  await mkdir(release, { recursive: false }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  await validateRelease(root, owned);
  for (const { filename, data } of artifacts) await writeOwned(release, filename, data);
  return {
    version: manifest.version, sourceFiles: source.size, webFiles: web.size,
    artifacts: artifacts.map(({ filename, sha256, data }) => ({ filename, sha256, bytes: data.length })),
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length > 2) throw new Error('Uso: node scripts/package.mjs');
    const result = await packageProject();
    console.log(`Paquetes v${result.version}: ${result.sourceFiles} archivos fuente y ${result.webFiles} archivos web.`);
    for (const artifact of result.artifacts) console.log(`release/${artifact.filename} (${artifact.bytes} bytes)`);
  } catch (error) {
    console.error(`No se pudo empaquetar: ${error.code === 'ENOENT' ? 'Falta un archivo o una carpeta requerida.' : error.message}`);
    process.exitCode = 1;
  }
}
