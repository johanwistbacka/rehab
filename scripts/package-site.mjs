import {copyFile, mkdir, readFile, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const source = fileURLToPath(new URL('../dist/', import.meta.url));
const target = fileURLToPath(new URL('../_site/', import.meta.url));
const files = [
  'index.html', 'style.css', 'app.js', 'model.js', 'storage.js', 'sound.js',
  'sw.js', 'icon.svg', 'manifest.json', 'assets/icon-192.png', 'assets/icon-512.png',
  ...Array.from({length:8}, (_, i) => `assets/exercise-${i}.png`),
  ...Array.from({length:8}, (_, i) => `assets/illustrations/1950s/exercise-${i}.png`)
];

// Check every input before replacing the generated publishing directory.
await Promise.all(files.map(file => readFile(path.join(source, file))));
await rm(target, {recursive:true, force:true});
for (const file of files) {
  const destination = path.join(target, file);
  await mkdir(path.dirname(destination), {recursive:true});
  await copyFile(path.join(source, file), destination);
}
console.log(`Packaged ${files.length} app files in _site/ (current illustrations only).`);
