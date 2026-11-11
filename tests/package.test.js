import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rmdir, symlink, unlink, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import test from 'node:test';
import { createZipArchive, packageProject } from '../scripts/package.mjs';
import { PUBLIC_FILES } from '../scripts/project-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'work');
const VERSION = '1.1.1';
const ARTIFACTS = [`neos-cotiza-v${VERSION}-github.zip`, `neos-cotiza-v${VERSION}-web.zip`, 'SHA256SUMS.txt'];

// Lector y CRC independientes del escritor: interpreta tanto el directorio
// central como cada cabecera local y descomprime con la biblioteca de Node.
function independentCrc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function readZip(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  assert.equal(bytes.readUInt16LE(end + 4), 0);
  assert.equal(bytes.readUInt16LE(end + 6), 0);
  assert.equal(bytes.readUInt16LE(end + 20), 0);
  const count = bytes.readUInt16LE(end + 10);
  assert.equal(bytes.readUInt16LE(end + 8), count);
  const centralOffset = bytes.readUInt32LE(end + 16);
  assert.equal(centralOffset + bytes.readUInt32LE(end + 12), end);
  const entries = new Map();
  let position = centralOffset;
  let nextLocal = 0;
  for (let index = 0; index < count; index += 1) {
    assert.equal(bytes.readUInt32LE(position), 0x02014b50);
    assert.equal(bytes.readUInt16LE(position + 4), 0x0314);
    assert.equal(bytes.readUInt16LE(position + 6), 20);
    assert.equal(bytes.readUInt16LE(position + 8), 0x0800);
    assert.equal(bytes.readUInt16LE(position + 10), 8);
    assert.equal(bytes.readUInt16LE(position + 12), 0);
    assert.equal(bytes.readUInt16LE(position + 14), (46 << 9) | (11 << 5) | 10);
    const crc = bytes.readUInt32LE(position + 16);
    const compressedSize = bytes.readUInt32LE(position + 20);
    const size = bytes.readUInt32LE(position + 24);
    const nameLength = bytes.readUInt16LE(position + 28);
    assert.equal(bytes.readUInt16LE(position + 30), 0);
    assert.equal(bytes.readUInt16LE(position + 32), 0);
    assert.equal(bytes.readUInt16LE(position + 34), 0);
    assert.equal(bytes.readUInt16LE(position + 36), 0);
    assert.equal(bytes.readUInt32LE(position + 38) >>> 16, 0o100644);
    const local = bytes.readUInt32LE(position + 42);
    assert.equal(local, nextLocal);
    const nameBytes = bytes.subarray(position + 46, position + 46 + nameLength);
    const name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    assert.equal(bytes.readUInt16LE(local + 4), 20);
    assert.equal(bytes.readUInt16LE(local + 6), 0x0800);
    assert.equal(bytes.readUInt16LE(local + 8), 8);
    assert.equal(bytes.readUInt16LE(local + 10), 0);
    assert.equal(bytes.readUInt16LE(local + 12), (46 << 9) | (11 << 5) | 10);
    assert.equal(bytes.readUInt32LE(local + 14), crc);
    assert.equal(bytes.readUInt32LE(local + 18), compressedSize);
    assert.equal(bytes.readUInt32LE(local + 22), size);
    assert.equal(bytes.readUInt16LE(local + 26), nameLength);
    assert.equal(bytes.readUInt16LE(local + 28), 0);
    assert.deepEqual(bytes.subarray(local + 30, local + 30 + nameLength), nameBytes);
    const dataStart = local + 30 + nameLength;
    nextLocal = dataStart + compressedSize;
    const data = inflateRawSync(bytes.subarray(dataStart, nextLocal));
    assert.equal(data.length, size);
    assert.equal(independentCrc(data), crc);
    assert.equal(entries.has(name), false);
    entries.set(name, data);
    position += 46 + nameLength;
  }
  assert.equal(nextLocal, centralOffset);
  assert.equal(position, end);
  assert.deepEqual([...entries.keys()], [...entries.keys()].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))));
  return entries;
}

async function fixture(t) {
  await mkdir(WORK, { recursive: true });
  const root = await mkdtemp(path.join(WORK, 'neos-cotiza-package-'));
  const tracked = new Set(['']);
  const filename = (relative) => {
    const resolved = path.resolve(root, relative);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('Fixture fuera de work');
    return resolved;
  };
  function remember(relative) {
    filename(relative);
    let current = relative;
    while (current && current !== '.') {
      tracked.add(current);
      current = path.posix.dirname(current);
    }
  }
  async function directory(relative) {
    remember(relative);
    await mkdir(filename(relative), { recursive: true });
  }
  async function write(relative, data) {
    remember(relative);
    await directory(path.posix.dirname(relative));
    await writeFile(filename(relative), data);
  }
  async function link(relative, target, type) {
    remember(relative);
    await directory(path.posix.dirname(relative));
    await symlink(filename(target), filename(relative), type);
  }
  t.after(async () => {
    assert.equal(path.dirname(root), WORK);
    assert.ok(path.basename(root).startsWith('neos-cotiza-package-'));
    for (const relative of [...tracked].sort((left, right) => right.split('/').length - left.split('/').length || right.length - left.length)) {
      const target = filename(relative);
      let info;
      try { info = await lstat(target); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (info.isDirectory() && !info.isSymbolicLink()) await rmdir(target);
      else await unlink(target);
    }
  });
  for (const relative of ['.github', 'assets', 'docs', 'scripts', 'src', 'styles', 'tests', 'examples']) await directory(relative);
  for (const relative of ['.gitignore', 'CONTRIBUTING.md', 'README.md', 'SECURITY.md']) await write(relative, 'Muestra ficticia del proyecto.\n');
  await write('package.json', JSON.stringify({ name: 'neos-cotiza', version: VERSION, type: 'module', private: true }));
  await write('package-lock.json', JSON.stringify({ name: 'neos-cotiza', version: VERSION, packages: { '': { name: 'neos-cotiza', version: VERSION } } }));
  for (const relative of PUBLIC_FILES) {
    const data = /\.(?:webp|woff2)$/u.test(relative) ? Buffer.from([0, 0xff, 0x80, 0x52]) : Buffer.from(`MUESTRA_PUBLICA_FICTICIA:${relative}\n`);
    await write(relative, data);
    await write(`dist/${relative}`, data);
  }
  await write('dist/.nojekyll', '');
  await write('.github/workflows/checks.yml', 'name: Prueba ficticia\n');
  await write('scripts/example.mjs', 'export const fixture = true;\n');
  await write('tests/example.test.js', '// Muestra ficticia.\n');
  await write('docs/Guía.md', 'Texto de muestra: acción y cotización.\n');
  await write('examples/README.md', 'Ejemplo con datos ficticios.\n');
  await write('examples/propuesta-ejemplo.pdf', '%PDF-1.4\n% MUESTRA_FICTICIA\n');
  for (const name of ARTIFACTS) remember(`release/${name}`);
  return { root, filename, write, directory, link };
}

function skipSymlink(error, t) {
  if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
    t.skip('El sistema no permite crear este enlace simbólico.');
    return true;
  }
  return false;
}

test('ZIP32 conserva bytes, CRC, UTF-8, permisos y fecha fija en cabeceras locales y centrales', () => {
  const entries = [{ name: 'neos-cotiza/docs/Guía.md', data: Buffer.from('Acción: ejemplo ficticio.\n') }, { name: '.nojekyll', data: Buffer.alloc(0) }];
  const result = readZip(createZipArchive(entries));
  for (const { name, data } of entries) assert.deepEqual(result.get(name), data);
  assert.equal(independentCrc(Buffer.from('123456789')), 0xcbf43926);
});

test('ZIP32 rechaza traversal, URLs, rutas Windows, nombres ambiguos y duplicados', () => {
  for (const name of ['../x', '/x', '//example.invalid/x', 'https://example.invalid/x', 'C:/x', 'x\\y', 'x/../y', 'x/./y', 'x//y', 'x/', 'x%2fy', 'x?y', 'x#y', 'x\u0000y', 'NUL.txt', 'x/CON', 'x.']) {
    assert.throws(() => createZipArchive([{ name, data: Buffer.from('ficticio') }]), /Ruta/u, name);
  }
  assert.throws(() => createZipArchive([{ name: 'README.md', data: Buffer.alloc(0) }, { name: 'readme.md', data: Buffer.alloc(0) }]), /duplicado/u);
});

test('package genera ambos ZIP, verifica SHA256 y es reproducible aunque cambien mtimes', async (t) => {
  const sample = await fixture(t);
  for (const relative of ['.git/config', 'private/note.md', 'exports/result.json', 'node_modules/example.js', 'root-unselected.txt']) await sample.write(relative, 'MUESTRA_EXCLUIDA');
  const first = await packageProject({ rootDirectory: sample.root });
  assert.equal(first.version, VERSION);
  assert.equal(first.webFiles, PUBLIC_FILES.length + 1);
  assert.deepEqual((await readdir(sample.filename('release'))).sort(), [...ARTIFACTS].sort());
  const original = new Map();
  for (const artifact of first.artifacts) {
    const bytes = await readFile(sample.filename(`release/${artifact.filename}`));
    original.set(artifact.filename, bytes);
    assert.equal(bytes.length, artifact.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
  }
  const github = readZip(original.get(ARTIFACTS[0]));
  const web = readZip(original.get(ARTIFACTS[1]));
  assert.equal(github.size, first.sourceFiles);
  assert.deepEqual([...web.keys()].sort(), [...PUBLIC_FILES, '.nojekyll'].sort());
  assert.ok(github.has('neos-cotiza/examples/propuesta-ejemplo.pdf'));
  assert.ok(github.has('neos-cotiza/docs/Guía.md'));
  for (const [entry, bytes] of github) {
    assert.ok(entry.startsWith('neos-cotiza/'));
    const relative = entry.slice('neos-cotiza/'.length);
    assert.equal(/^(?:\.git\/|private\/|exports\/|node_modules\/|work\/|dist\/|release\/)/u.test(relative), false);
    assert.deepEqual(bytes, await readFile(sample.filename(relative)));
  }
  for (const [entry, bytes] of web) assert.deepEqual(bytes, await readFile(sample.filename(`dist/${entry}`)));
  const expectedSums = first.artifacts.slice(0, 2).map(({ filename, sha256 }) => `${sha256}  ${filename}\n`).join('');
  assert.equal(original.get('SHA256SUMS.txt').toString('utf8'), expectedSums);
  await utimes(sample.filename('index.html'), new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'));
  const second = await packageProject({ rootDirectory: sample.root });
  assert.deepEqual(second, first);
  for (const name of ARTIFACTS) assert.deepEqual(await readFile(sample.filename(`release/${name}`)), original.get(name));
});

test('package rechaza nombres privados y archivos ocultos dentro de carpetas fuente permitidas', async (t) => {
  const sample = await fixture(t);
  for (const relative of ['assets/.env', 'docs/credentials.json', 'src/private/data.js', 'docs/backup.bak', 'examples/propuesta-cliente.pdf', 'docs/notes.log', 'assets/copied.zip']) {
    await sample.write(relative, 'MUESTRA_FICTICIA');
    await assert.rejects(packageProject({ rootDirectory: sample.root }), /privad|permitid|ocult|secret/iu, relative);
    await unlink(sample.filename(relative));
    if (relative === 'src/private/data.js') await rmdir(sample.filename('src/private'));
    await assert.rejects(lstat(sample.filename('release')), { code: 'ENOENT' });
  }
});

test('package rechaza secretos de contenido sin imprimir el valor', async (t) => {
  const sample = await fixture(t);
  const synthetic = ['gh', 'p_', '0'.repeat(36)].join('');
  await sample.write('docs/settings.json', JSON.stringify({ fixture: synthetic }));
  await assert.rejects(packageProject({ rootDirectory: sample.root }), (error) => {
    assert.match(error.message, /secretos/u);
    assert.equal(error.message.includes(synthetic), false);
    return true;
  });
});

test('package detecta un dist desactualizado o con archivos extra antes de crear release', async (t) => {
  const sample = await fixture(t);
  const original = await readFile(sample.filename('src/app.js'));
  await sample.write('dist/src/app.js', 'CONTENIDO_DESACTUALIZADO');
  await assert.rejects(packageProject({ rootDirectory: sample.root }), /dist desactualizado/u);
  await sample.write('dist/src/app.js', original);
  await sample.write('dist/assets/fonts/private.txt', 'MUESTRA_EXTRA');
  await assert.rejects(packageProject({ rootDirectory: sample.root }), /Contenido inesperado en dist/u);
  await assert.rejects(lstat(sample.filename('release')), { code: 'ENOENT' });
});

test('package conserva archivos y entregas anteriores ante contenido desconocido en release', async (t) => {
  const sample = await fixture(t);
  await packageProject({ rootDirectory: sample.root });
  const original = await readFile(sample.filename(`release/${ARTIFACTS[0]}`));
  await sample.write('release/other.txt', 'ARCHIVO_A_CONSERVAR');
  await assert.rejects(packageProject({ rootDirectory: sample.root }), /Contenido inesperado en release/u);
  assert.deepEqual(await readFile(sample.filename(`release/${ARTIFACTS[0]}`)), original);
  assert.equal(await readFile(sample.filename('release/other.txt'), 'utf8'), 'ARCHIVO_A_CONSERVAR');
});

test('package rechaza raíces, fuentes y release enlazados mediante directorios', async (t) => {
  const sample = await fixture(t);
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  await sample.directory('outside-output');
  try { await sample.link('release', 'outside-output', type); } catch (error) { if (skipSymlink(error, t)) return; throw error; }
  await assert.rejects(packageProject({ rootDirectory: sample.root }), /enlace|local/iu);
  assert.deepEqual(await readdir(sample.filename('outside-output')), []);
  await unlink(sample.filename('release'));
  await sample.link('docs/linked', 'outside-output', type);
  await assert.rejects(packageProject({ rootDirectory: sample.root }), /enlace/iu);
  await unlink(sample.filename('docs/linked'));
  await sample.link('root-link', '.', type);
  await assert.rejects(packageProject({ rootDirectory: sample.filename('root-link') }), /enlace/iu);
});

test('package rechaza un archivo fuente enlazado', async (t) => {
  const sample = await fixture(t);
  try { await sample.link('docs/linked.md', 'README.md', 'file'); } catch (error) { if (skipSymlink(error, t)) return; throw error; }
  await assert.rejects(packageProject({ rootDirectory: sample.root }), /enlace/iu);
});
