// Otimiza texturas embutidas em arquivos .glb reduzindo a resolução (o que
// corta VRAM e banda — principal gargalo com duas janelas / GPU integrada).
// Mantém o formato PNG, então NÃO exige nenhuma mudança no loader em runtime.
//
// Uso:  npm run optimize:models
//
// Próximo passo (quando rodar onde o npm funciona): trocar PNG por KTX2/Basis
// com @gltf-transform/cli para reduzir também a VRAM em repouso. Ver
// PLANO-PERFORMANCE.md (Fase 1).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const GLB_MAGIC = 0x46546c67; // 'glTF'
const JSON_TYPE = 0x4e4f534a; // 'JSON'
const BIN_TYPE = 0x004e4942; // 'BIN\0'

// Tetos de resolução por modelo (lado maior, em pixels).
const HERO_CAP = 1024; // herói: visto de perto, precisa de mais nitidez
const ENEMY_CAP = 512; // zumbi: visto a distância, 512 é suficiente

function discoverTargets() {
  const targets = [{ file: path.join(ROOT, 'public/models/warrior.glb'), cap: HERO_CAP }];
  const zombieDir = path.join(ROOT, 'public/models/zombie');
  if (fs.existsSync(zombieDir)) {
    for (const name of fs.readdirSync(zombieDir)) {
      if (name.toLowerCase().endsWith('.glb')) targets.push({ file: path.join(zombieDir, name), cap: ENEMY_CAP });
    }
  }
  return targets.filter((t) => fs.existsSync(t.file));
}

function readGLB(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`não é um .glb válido: ${file}`);
  const total = buf.readUInt32LE(8);
  let off = 12;
  let json = null;
  let bin = Buffer.alloc(0);
  while (off < total) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    off += 8;
    const chunk = buf.subarray(off, off + len);
    off += len;
    if (type === JSON_TYPE) json = JSON.parse(chunk.toString('utf8'));
    else if (type === BIN_TYPE) bin = Buffer.from(chunk);
  }
  if (!json) throw new Error(`chunk JSON ausente em ${file}`);
  return { json, bin };
}

const align4 = (n) => (n + 3) & ~3;

function writeGLB(file, json, bin) {
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = align4(jsonBuf.length) - jsonBuf.length;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.from(' '.repeat(jsonPad))]);
  const binPad = align4(bin.length) - bin.length;
  const binBuf = binPad ? Buffer.concat([bin, Buffer.alloc(binPad)]) : bin;

  const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const out = Buffer.alloc(total);
  let o = 0;
  o = out.writeUInt32LE(GLB_MAGIC, o);
  o = out.writeUInt32LE(2, o);
  o = out.writeUInt32LE(total, o);
  o = out.writeUInt32LE(jsonBuf.length, o);
  o = out.writeUInt32LE(JSON_TYPE, o);
  o += jsonBuf.copy(out, o);
  o = out.writeUInt32LE(binBuf.length, o);
  o = out.writeUInt32LE(BIN_TYPE, o);
  binBuf.copy(out, o);
  fs.writeFileSync(file, out);
}

async function optimize(file, cap) {
  const before = fs.statSync(file).size;
  const { json, bin } = readGLB(file);
  const bufferViews = json.bufferViews || [];
  const images = json.images || [];

  const replaced = new Map(); // bufferView index -> novo Buffer (PNG)
  let vramBefore = 0;
  let vramAfter = 0;
  const dims = [];

  for (const img of images) {
    if (img.bufferView === undefined) continue;
    const bv = bufferViews[img.bufferView];
    const data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const meta = await sharp(data).metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    vramBefore += w * h * 4;
    const maxSide = Math.max(w, h);
    if (maxSide > cap) {
      const out = await sharp(data)
        .resize(cap, cap, { fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const nm = await sharp(out).metadata();
      replaced.set(img.bufferView, out);
      img.mimeType = 'image/png';
      vramAfter += (nm.width || 0) * (nm.height || 0) * 4;
      dims.push(`${w}x${h}->${nm.width}x${nm.height}`);
    } else {
      vramAfter += w * h * 4;
      dims.push(`${w}x${h}=`);
    }
  }

  if (replaced.size === 0) {
    console.log(`  (sem texturas acima de ${cap}px) ${path.relative(ROOT, file)}`);
    return { before, after: before, vramBefore, vramAfter };
  }

  // Reconstrói o buffer binário na ordem dos bufferViews, mantendo os não-imagem
  // byte-a-byte e alinhando cada início em 4 bytes (exigência do glTF).
  const chunks = [];
  let offset = 0;
  bufferViews.forEach((bv, i) => {
    const bytes = replaced.has(i)
      ? replaced.get(i)
      : bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const pad = align4(offset) - offset;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      offset += pad;
    }
    bv.byteOffset = offset;
    bv.byteLength = bytes.length;
    chunks.push(Buffer.from(bytes));
    offset += bytes.length;
  });
  const newBin = Buffer.concat(chunks);
  if (json.buffers && json.buffers[0]) json.buffers[0].byteLength = newBin.length;

  writeGLB(file, json, newBin);
  const after = fs.statSync(file).size;
  console.log(`  ${path.relative(ROOT, file)}`);
  console.log(`    ${(before / 1048576).toFixed(1)}MB -> ${(after / 1048576).toFixed(1)}MB | texturas: ${dims.join(', ')}`);
  return { before, after, vramBefore, vramAfter };
}

const targets = discoverTargets();
console.log(`Otimizando ${targets.length} modelo(s)...`);
let tb = 0;
let ta = 0;
let vb = 0;
let va = 0;
for (const t of targets) {
  const r = await optimize(t.file, t.cap);
  tb += r.before;
  ta += r.after;
  vb += r.vramBefore;
  va += r.vramAfter;
}
console.log('—');
console.log(`Disco:  ${(tb / 1048576).toFixed(1)}MB -> ${(ta / 1048576).toFixed(1)}MB`);
console.log(`VRAM de textura (sem mips): ${(vb / 1048576).toFixed(1)}MB -> ${(va / 1048576).toFixed(1)}MB`);
