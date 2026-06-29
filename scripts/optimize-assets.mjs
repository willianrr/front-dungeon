import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const sourceDir = path.join(root, 'public', 'models', 'items', 'Icons');
const targetDir = path.join(sourceDir, 'runtime');
const hudRuntimeDir = path.join(root, 'public', 'hud', 'runtime');

const icons = [
  'Coin.png',
  'Potion1_Filled_Red.png',
  'Sword_Golden.png',
  'Crystal5.png',
  'Crystal1.png',
];

await fs.mkdir(targetDir, { recursive: true });
await fs.mkdir(hudRuntimeDir, { recursive: true });

for (const file of icons) {
  const source = path.join(sourceDir, file);
  const target = path.join(targetDir, file);
  await sharp(source)
    .resize(192, 192, { fit: 'contain', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toFile(target);
  const stat = await fs.stat(target);
  console.log(`${path.relative(root, target)} ${Math.round(stat.size / 1024)}KB`);
}

const skillIcons = [
  {
    source: path.join(root, 'public', 'particle', 'PNG (Transparent)', 'magic_05.png'),
    target: path.join(hudRuntimeDir, 'arcane-nova.png'),
  },
];

for (const icon of skillIcons) {
  await sharp(icon.source)
    .resize(160, 160, { fit: 'contain', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toFile(icon.target);
  const stat = await fs.stat(icon.target);
  console.log(`${path.relative(root, icon.target)} ${Math.round(stat.size / 1024)}KB`);
}
