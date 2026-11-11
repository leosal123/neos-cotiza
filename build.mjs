import { copyFile, lstat, mkdir, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_FILES } from './project-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DIRECTORIES = new Set(PUBLIC_FILES.flatMap((relative) => {
  const parts = relative.split('/');
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
}));
const OUTPUTS = new Set([...PUBLIC_FILES, '.nojekyll']);

async function optionalInfo(filename) {
  try {
    return await lstat(filename);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function validateSource(relative) {
  const parts = relative.split('/');
  let current = ROOT;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`Enlace simbólico no permitido: ${relative}`);
    if (index === parts.length - 1 ? !info.isFile() : !info.isDirectory()) {
      throw new Error(`Archivo fuente no válido: ${relative}`);
    }
  }
  return current;
}

async function validateDist(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Enlace simbólico en dist: ${relative}`);
    if (entry.isDirectory() && DIRECTORIES.has(relative)) {
      await validateDist(path.join(directory, entry.name), relative);
    } else if (!entry.isFile() || !OUTPUTS.has(relative)) {
      throw new Error(`Contenido inesperado en dist: ${relative}. Revísalo y retíralo antes de compilar.`);
    }
  }
}

async function build() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Se requiere Node.js 22 o posterior.');
  const realRoot = await realpath(ROOT);
  if (path.dirname(DIST) !== ROOT || path.basename(DIST) !== 'dist') throw new Error('Destino de compilación no válido.');
  const sources = [];
  // Se comprueban todas las fuentes antes de sobrescribir una entrega anterior.
  for (const relative of PUBLIC_FILES) sources.push([relative, await validateSource(relative)]);
  const distInfo = await optionalInfo(DIST);
  if (distInfo && (!distInfo.isDirectory() || distInfo.isSymbolicLink())) throw new Error('dist debe ser una carpeta local.');
  if (distInfo) await validateDist(DIST);
  await mkdir(DIST, { recursive: true });
  if (await realpath(DIST) !== path.join(realRoot, 'dist')) throw new Error('dist apunta fuera del proyecto.');
  for (const directory of DIRECTORIES) await mkdir(path.join(DIST, directory), { recursive: true });
  for (const [relative, source] of sources) {
    const destination = path.join(DIST, ...relative.split('/'));
    const info = await optionalInfo(destination);
    if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error(`Destino no válido: ${relative}`);
    await copyFile(source, destination);
  }
  const marker = path.join(DIST, '.nojekyll');
  const markerInfo = await optionalInfo(marker);
  if (markerInfo && (!markerInfo.isFile() || markerInfo.isSymbolicLink())) throw new Error('Marcador de entrega no válido.');
  await writeFile(marker, '', 'utf8');
  console.log(`Compilación completa: ${PUBLIC_FILES.length} archivos públicos y .nojekyll en dist/.`);
}

try {
  await build();
} catch (error) {
  console.error(`No se pudo compilar: ${error.message}`);
  process.exitCode = 1;
}
