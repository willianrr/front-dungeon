import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(tmpdir(), 'aranna-verify-keyboard-move');

async function compileModule(relativeSource, outputName) {
  const sourcePath = path.join(root, relativeSource);
  const outPath = path.join(outDir, outputName);
  const source = await readFile(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
    fileName: sourcePath,
  });
  await writeFile(outPath, compiled.outputText, 'utf8');
  return outPath;
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const keyboardMovePath = await compileModule('src/core/KeyboardMoveController.ts', 'KeyboardMoveController.mjs');
const clientMovementPath = await compileModule('src/core/ClientMovementPredictor.ts', 'ClientMovementPredictor.mjs');

const { KeyboardMoveController } = await import(`${pathToFileURL(keyboardMovePath).href}?t=${Date.now()}`);
const { ClientMovementPredictor } = await import(`${pathToFileURL(clientMovementPath).href}?t=${Date.now()}`);

const idle = {
  dt: 1 / 60,
  movementChanged: false,
  axes: { strafe: 0, forward: 0 },
  running: false,
  player: { x: 0, z: 0 },
  direction: { x: 0, z: 0 },
};

function collect(controller, samples) {
  return samples
    .map((sample) => controller.update(sample))
    .filter((decision) => decision.type !== 'none');
}

{
  const controller = new KeyboardMoveController();
  const decisions = collect(controller, Array.from({ length: 300 }, () => idle));
  assert.equal(decisions.length, 0, 'idle player must not send commands');
}

{
  const controller = new KeyboardMoveController();
  const first = controller.update({
    ...idle,
    movementChanged: true,
    axes: { strafe: 0, forward: 1 },
    direction: { x: 0, z: -1 },
  });
  assert.equal(first.type, 'move', 'pressing W must send one movement command');
  assert.deepEqual(first.target, { x: 0, y: 0, z: -18 });

  const heldDecisions = collect(
    controller,
    Array.from({ length: 120 }, () => ({
      ...idle,
      axes: { strafe: 0, forward: 1 },
      direction: { x: 0, z: -1 },
    })),
  );
  assert.equal(heldDecisions.length, 0, 'holding W far from target must not stream commands every frame');
}

{
  const controller = new KeyboardMoveController();
  controller.update({
    ...idle,
    movementChanged: true,
    axes: { strafe: 0, forward: 1 },
    direction: { x: 0, z: -1 },
  });
  const refresh = controller.update({
    ...idle,
    dt: 0.5,
    axes: { strafe: 0, forward: 1 },
    player: { x: 0, z: -14 },
    direction: { x: 0, z: -1 },
  });
  assert.equal(refresh.type, 'move', 'held movement may refresh only when the long target is nearly reached');
  assert.deepEqual(refresh.target, { x: 0, y: 0, z: -32 });
}

{
  const controller = new KeyboardMoveController();
  controller.update({
    ...idle,
    movementChanged: true,
    axes: { strafe: 1, forward: 0 },
    direction: { x: 1, z: 0 },
  });
  const stop = controller.update({
    ...idle,
    movementChanged: true,
    axes: { strafe: 0, forward: 0 },
    player: { x: 3, z: 2 },
  });
  assert.equal(stop.type, 'move', 'releasing WASD must send one stop command');
  assert.deepEqual(stop.target, { x: 3, y: 0, z: 2 });
  assert.equal(stop.run, false);

  const afterStop = collect(controller, Array.from({ length: 120 }, () => idle));
  assert.equal(afterStop.length, 0, 'after stop, idle frames must remain silent');
}

{
  const controller = new KeyboardMoveController();
  const shiftOnly = controller.update({ ...idle, movementChanged: true, running: true });
  assert.equal(shiftOnly.type, 'none', 'Shift without movement must not send network commands');
}

{
  const predictor = new ClientMovementPredictor();
  const terrain = { half: 100, heightAt: (x, z) => x * 0.1 + z * 0.01 };
  const idlePrediction = predictor.predict({
    dt: 1 / 60,
    axes: { strafe: 0, forward: 0 },
    running: false,
    direction: { x: 0, z: 0 },
    current: { x: 0, y: 0, z: 0 },
    terrain,
    zone: 'overworld',
  });
  assert.equal(idlePrediction, null, 'idle player must not be predicted locally');

  const walkPrediction = predictor.predict({
    dt: 1,
    axes: { strafe: 0, forward: 1 },
    running: false,
    direction: { x: 0, z: -1 },
    current: { x: 0, y: 0, z: 0 },
    terrain,
    zone: 'overworld',
  });
  assert.equal(walkPrediction.position.z, -0.21000000000000002, 'prediction clamps dt to one render frame');
  assert.equal(walkPrediction.running, false);

  const runPrediction = predictor.predict({
    dt: 1 / 60,
    axes: { strafe: 1, forward: 0 },
    running: true,
    direction: { x: 1, z: 0 },
    current: { x: 99.95, y: 0, z: 0 },
    terrain,
    zone: 'dungeon',
  });
  assert.equal(runPrediction.position.x, 100, 'prediction must respect terrain bounds');
  assert.equal(runPrediction.position.y, 0, 'dungeon prediction uses the flat floor height');
  assert.equal(runPrediction.running, true);
}

console.info('keyboard move verification passed');
