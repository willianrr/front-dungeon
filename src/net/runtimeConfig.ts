// Resolve as URLs do backend em runtime.
// Prioridade: window.__ARANNA_CONFIG__ (injetado no start) > import.meta.env (build) > localhost.
// O nonEmpty trata string vazia como "ausente" — sem isso, um VITE_API_URL=""
// assado no build passaria batido pelo ?? e quebraria as chamadas (URL relativa).

type RuntimeConfig = {
  apiUrl?: string;
  wsUrl?: string;
};

declare global {
  interface Window {
    __ARANNA_CONFIG__?: RuntimeConfig;
  }
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

const runtimeConfig: RuntimeConfig =
  typeof window === 'undefined' ? {} : window.__ARANNA_CONFIG__ ?? {};

export const API_URL = (
  nonEmpty(runtimeConfig.apiUrl) ??
  nonEmpty(import.meta.env.VITE_API_URL) ??
  'http://localhost:8080/api/v1'
).replace(/\/$/, '');

export const WS_URL =
  nonEmpty(runtimeConfig.wsUrl) ??
  nonEmpty(import.meta.env.VITE_WS_URL) ??
  'ws://localhost:8080/ws/game';
