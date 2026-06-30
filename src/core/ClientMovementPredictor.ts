import type { V3 } from '../shared/mathx';
import type { WorldZone } from '../shared/types';
import type { KeyboardMoveAxes, KeyboardMoveDirection } from './KeyboardMoveController';

interface MovementTerrain {
  half: number;
  heightAt(x: number, z: number): number;
}

export interface ClientMovementPredictionSample {
  dt: number;
  axes: KeyboardMoveAxes;
  running: boolean;
  direction: KeyboardMoveDirection;
  current: Pick<V3, 'x' | 'y' | 'z'>;
  terrain: MovementTerrain;
  zone: WorldZone;
}

export interface ClientMovementPrediction {
  position: V3;
  rotationY: number;
  running: boolean;
}

const WALK_SPEED = 4.2;
const RUN_SPEED = 7.8;
const MAX_PREDICTION_DT = 0.05;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class ClientMovementPredictor {
  predict(sample: ClientMovementPredictionSample): ClientMovementPrediction | null {
    const moving = sample.axes.strafe !== 0 || sample.axes.forward !== 0;
    if (!moving || (sample.direction.x === 0 && sample.direction.z === 0)) return null;

    const speed = sample.running ? RUN_SPEED : WALK_SPEED;
    const step = speed * Math.min(Math.max(sample.dt, 0), MAX_PREDICTION_DT);
    const x = clamp(sample.current.x + sample.direction.x * step, -sample.terrain.half, sample.terrain.half);
    const z = clamp(sample.current.z + sample.direction.z * step, -sample.terrain.half, sample.terrain.half);
    const y = sample.zone === 'dungeon' ? sample.terrain.heightAt(0, 0) : sample.terrain.heightAt(x, z);

    return {
      position: { x, y, z },
      rotationY: Math.atan2(sample.direction.x, sample.direction.z),
      running: sample.running,
    };
  }
}
