// Placeholder versionado. Em produção, scripts/write-runtime-config.mjs
// sobrescreve dist/config.js no start com os valores reais de process.env.VITE_*.
// Em dev (vite), este arquivo fica vazio e o app cai em import.meta.env / localhost.
window.__ARANNA_CONFIG__ = window.__ARANNA_CONFIG__ || {};
