const apiUrl = process.env.ARANNA_API_URL ?? 'http://localhost:8080/api/v1';
const wsUrl = process.env.ARANNA_WS_URL ?? 'ws://localhost:8080/ws/game';
const durationMs = Number(process.env.ARANNA_WS_PROBE_MS ?? 3500);
const warmupMs = Number(process.env.ARANNA_WS_PROBE_WARMUP_MS ?? 2500);
const clientCount = Math.max(1, Number(process.env.ARANNA_WS_PROBE_CLIENTS ?? 1));
const action = process.env.ARANNA_WS_PROBE_ACTION ?? 'idle';
const activeClients = Math.max(1, Number(process.env.ARANNA_WS_PROBE_ACTIVE_CLIENTS ?? clientCount));

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
  };
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return body.data;
}

const password = 'codex123456';
const clients = [];

for (let index = 0; index < clientCount; index++) {
  const email = `codex-perf-${Date.now()}-${index}@local.test`;
  const auth = await request('/accounts/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const characters = await request('/characters', { token: auth.token });
  const character = characters[0] ?? await request('/characters', {
    method: 'POST',
    token: auth.token,
    body: JSON.stringify({ name: `CodexPerf${index + 1}` }),
  });
  const socket = new WebSocket(`${wsUrl}?token=${encodeURIComponent(auth.token)}&characterId=${character.id}`);
  const stats = {
    email,
    characterId: character.id,
    clientCommandsSent: 0,
    receivedMessages: 0,
    receivedBytes: 0,
    welcome: 0,
    snapshots: 0,
  };
  socket.addEventListener('message', (event) => {
    const raw = String(event.data);
    stats.receivedMessages++;
    stats.receivedBytes += raw.length;
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'welcome') stats.welcome++;
      if (msg.type === 'snapshot') stats.snapshots++;
    } catch {
      // Keep byte/message accounting even for malformed payloads.
    }
  });
  clients.push({ socket, stats });
}

function resetStats(stats) {
  stats.clientCommandsSent = 0;
  stats.receivedMessages = 0;
  stats.receivedBytes = 0;
  stats.welcome = 0;
  stats.snapshots = 0;
}

await Promise.all(clients.map(({ socket }) => new Promise((resolve, reject) => {
  if (socket.readyState === WebSocket.OPEN) {
    resolve();
    return;
  }
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', () => reject(new Error('WebSocket probe failed')), { once: true });
})));

if (warmupMs > 0) {
  await new Promise((resolve) => setTimeout(resolve, warmupMs));
  for (const { stats } of clients) resetStats(stats);
}
if (action === 'move') {
  for (const { socket, stats } of clients.slice(0, activeClients)) {
    socket.send(JSON.stringify({
      type: 'move',
      entityId: 'probe',
      target: { x: 10 + stats.characterId * 0.1, y: 0, z: 0 },
      run: true,
    }));
    stats.clientCommandsSent++;
  }
}
await new Promise((resolve) => setTimeout(resolve, durationMs));
for (const { socket } of clients) socket.close();

const totals = clients.reduce((acc, { stats }) => {
  acc.clientCommandsSent += stats.clientCommandsSent;
  acc.receivedMessages += stats.receivedMessages;
  acc.receivedBytes += stats.receivedBytes;
  acc.welcome += stats.welcome;
  acc.snapshots += stats.snapshots;
  return acc;
}, { clientCommandsSent: 0, receivedMessages: 0, receivedBytes: 0, welcome: 0, snapshots: 0 });
const seconds = durationMs / 1000;
const averageReceivedBytesPerClient = totals.receivedBytes / clientCount;
const averageSnapshotsPerClient = totals.snapshots / clientCount;

console.info(JSON.stringify({
  clientCount,
  totals,
  perClient: clients.map(({ stats }) => stats),
  averageReceivedBytesPerClient: Math.round(averageReceivedBytesPerClient),
  averageSnapshotsPerClient,
  averageSnapshotsPerSecondPerClient: Number((averageSnapshotsPerClient / seconds).toFixed(2)),
  averageKiBPerSecondPerClient: Number((averageReceivedBytesPerClient / seconds / 1024).toFixed(2)),
  action,
  activeClients: action === 'move' ? Math.min(activeClients, clientCount) : 0,
  warmupMs,
  durationMs,
}, null, 2));
