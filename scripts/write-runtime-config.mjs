// Gera dist/config.js no START, lendo as variaveis do ambiente do processo
// (process.env.VITE_*). Resolve o caso da plataforma so expor as envs em runtime,
// e nao no build — onde import.meta.env ficaria vazio e o front perderia o backend.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function readEnv(name) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

const config = {
  apiUrl: readEnv('VITE_API_URL'),
  wsUrl: readEnv('VITE_WS_URL'),
};

const distDir = path.resolve('dist');
const configPath = path.join(distDir, 'config.js');
const body = `window.__ARANNA_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`;

await mkdir(distDir, { recursive: true });
await writeFile(configPath, body, 'utf8');
console.log('[runtime-config] wrote', configPath, '->', config);
